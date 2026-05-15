import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Op, Transaction, WhereOptions } from 'sequelize';
import { Facility } from './facility.model';
import { CreateFacilityDto } from './dto/create-facility.dto';
import { UpdateFacilityDto } from './dto/update-facility.dto';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.model';
import { Role } from '../common/enums/role.enum';
import { EmailService } from '../common/services/email.service';
import { CreateFacilityResponse } from './interfaces/create-facility.response';
import { GetFacilitiesQueryDto } from './dto/get-facilities-query.dto';
import { PaginatedFacilitiesResult } from './dto/paginated-facilities.dto';
import { STORAGE_SERVICE } from '../storage/storage.service';
import type { StorageService } from '../storage/storage.service';
import { getUploadsSignedUrlExpirySeconds } from '../common/config/uploads.config';
import * as crypto from 'crypto';

@Injectable()
export class FacilityService {
  constructor(
    @InjectModel(Facility)
    private readonly facilityModel: typeof Facility,
    private readonly usersService: UsersService,
    private readonly emailService: EmailService,
    @InjectConnection()
    private readonly sequelize: Sequelize,
    @Inject(STORAGE_SERVICE) private readonly storageService: StorageService,
  ) {}

  async create(
    createFacilityDto: CreateFacilityDto,
    owner: User,
    contractDocument?: Express.Multer.File,
  ): Promise<CreateFacilityResponse> {
    if (owner.role !== Role.OWNER) {
      throw new ForbiddenException('Only owners can create facilities');
    }

    const existingFacility = await this.facilityModel.findOne({
      where: { email: createFacilityDto.email },
    });
    if (existingFacility) {
      throw new BadRequestException('Facility with this email already exists');
    }

    const existingAdmin = await this.usersService.findByEmail(createFacilityDto.adminEmail);
    if (existingAdmin) {
      throw new BadRequestException('Facility admin email already exists');
    }

    const contractDocumentPublicId = contractDocument?.buffer
      ? (await this.storageService.upload(
          contractDocument.buffer,
          contractDocument.originalname,
          contractDocument.mimetype,
        )).publicId
      : null;

    return await this.sequelize.transaction(async (transaction: Transaction) => {
      const facility = await this.facilityModel.create(
        {
          name: createFacilityDto.name,
          phone: createFacilityDto.phone,
          email: createFacilityDto.email,
          type: createFacilityDto.type,
          status: createFacilityDto.status,
          contractStart: new Date(createFacilityDto.contractStart),
          contractEnd: new Date(createFacilityDto.contractEnd),
          contractDocumentPublicId,
          totalBranches: 0,
          totalResidents: 0,
          facilityAdminName: `${createFacilityDto.adminFirstName} ${createFacilityDto.adminLastName}`,
        },
        { transaction },
      );

      const { user: facilityAdmin, rawToken } = await this.usersService.createWithSetPasswordToken(
        {
          firstName: createFacilityDto.adminFirstName,
          lastName: createFacilityDto.adminLastName,
          email: createFacilityDto.adminEmail,
          // Store a strong random password and ask the user to set their own via emailed link.
          password: crypto.randomBytes(24).toString('base64url'),
          role: Role.FACILITY_ADMIN,
          facilityId: facility.id,
        },
        owner,
        transaction,
      );

      facility.facilityAdminId = facilityAdmin.id;
      facility.facilityAdminName = `${facilityAdmin.firstName} ${facilityAdmin.lastName}`;
      await facility.save({ transaction });

      const frontendBaseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const setPasswordUrl = `${frontendBaseUrl.replace(/\/$/, '')}/set-password?inviteCode=${encodeURIComponent(rawToken)}`;
      await this.emailService.sendSetPasswordLink(
        facilityAdmin.email,
        facilityAdmin.firstName,
        setPasswordUrl,
        facility.name,
      );

      return {
        facility,
        facilityAdminTemporaryPassword: null as any,
      };
    });
  }

  private buildFilterWhere(query: GetFacilitiesQueryDto): WhereOptions<Facility> {
    const conditions: WhereOptions<Facility>[] = [];

    const search = query.search?.trim();
    if (search) {
      conditions.push({
        [Op.or]: [
          { name: { [Op.iLike]: `%${search}%` } },
          { facilityAdminName: { [Op.iLike]: `%${search}%` } },
        ],
      });
    }

    const status = query.status?.trim();
    if (status && status !== 'All') {
      conditions.push({ status });
    }

    if (conditions.length === 0) {
      return {};
    }

    return conditions.length === 1 ? conditions[0] : { [Op.and]: conditions };
  }

  async findAll(query: GetFacilitiesQueryDto = {}): Promise<PaginatedFacilitiesResult> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const where = this.buildFilterWhere(query);
    const offset = (page - 1) * limit;

    const { rows, count } = await this.facilityModel.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    const data = await Promise.all(rows.map((facility) => this.decorateFacility(facility)));
    const total = count;
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    return {
      data,
      total,
      page,
      limit,
      totalPages,
    };
  }

  async findOne(id: string, currentUser: User): Promise<any | null> {
    const facility = await this.facilityModel.findByPk(id);
    if (!facility) {
      return null;
    }

    if (currentUser.role === Role.OWNER) {
      return this.decorateFacility(facility);
    }

    // Facility/branch scoped roles can only read their own facility
    if (!currentUser.facilityId || facility.id !== currentUser.facilityId) {
      throw new ForbiddenException('Cannot access facilities outside your scope');
    }

    return this.decorateFacility(facility);
  }

  async update(id: string, updateFacilityDto: UpdateFacilityDto, owner: User): Promise<Facility> {
    if (owner.role !== Role.OWNER) {
      throw new ForbiddenException('Only owners can update facilities');
    }

    const facility = await this.facilityModel.findByPk(id);
    if (!facility) {
      throw new BadRequestException('Facility not found');
    }

    if (updateFacilityDto.email && updateFacilityDto.email !== facility.email) {
      const existingFacility = await this.facilityModel.findOne({
        where: { email: updateFacilityDto.email },
      });
      if (existingFacility && existingFacility.id !== facility.id) {
        throw new BadRequestException('Facility with this email already exists');
      }
    }

    if (facility.facilityAdminId) {
      const facilityAdmin = await this.usersService.findById(facility.facilityAdminId);

      if (facilityAdmin) {
        if (updateFacilityDto.adminEmail && updateFacilityDto.adminEmail !== facilityAdmin.email) {
          const existingAdmin = await this.usersService.findByEmail(updateFacilityDto.adminEmail);
          if (existingAdmin && existingAdmin.id !== facilityAdmin.id) {
            throw new BadRequestException('Facility admin email already exists');
          }
        }

        const adminUpdatePayload = {
          ...(updateFacilityDto.adminFirstName
            ? { firstName: updateFacilityDto.adminFirstName }
            : {}),
          ...(updateFacilityDto.adminLastName
            ? { lastName: updateFacilityDto.adminLastName }
            : {}),
          ...(updateFacilityDto.adminEmail
            ? { email: updateFacilityDto.adminEmail }
            : {}),
          ...(updateFacilityDto.adminPassword
            ? { password: updateFacilityDto.adminPassword }
            : {}),
        };

        const updatedAdmin = await this.usersService.update(
          facilityAdmin.id,
          adminUpdatePayload,
          owner,
        );

        facility.facilityAdminName = `${updatedAdmin.firstName} ${updatedAdmin.lastName}`;
      }
    }

    facility.name = updateFacilityDto.name ?? facility.name;
    facility.phone = updateFacilityDto.phone ?? facility.phone;
    facility.email = updateFacilityDto.email ?? facility.email;
    facility.type = updateFacilityDto.type ?? facility.type;
    facility.status = updateFacilityDto.status ?? facility.status;
    facility.contractStart = updateFacilityDto.contractStart
      ? new Date(updateFacilityDto.contractStart)
      : facility.contractStart;
    facility.contractEnd = updateFacilityDto.contractEnd
      ? new Date(updateFacilityDto.contractEnd)
      : facility.contractEnd;
    facility.contractDocumentUrl = updateFacilityDto.contractDocumentUrl ?? facility.contractDocumentUrl;

    await facility.save();

    return facility;
  }

  private async decorateFacility(facility: Facility): Promise<any> {
    const contractDocumentUrl = facility.contractDocumentPublicId
      ? await this.storageService.getSignedUrl(
          facility.contractDocumentPublicId,
          getUploadsSignedUrlExpirySeconds(),
        )
      : null;

    return {
      ...facility.get({ plain: true }),
      // Backwards-compatible response field: provide a signed URL, not a stored URL.
      contractDocumentUrl,
    };
  }
}
