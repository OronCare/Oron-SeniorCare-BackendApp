import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Transaction } from 'sequelize';
import { Facility } from './facility.model';
import { CreateFacilityDto } from './dto/create-facility.dto';
import { UpdateFacilityDto } from './dto/update-facility.dto';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.model';
import { Role } from '../common/enums/role.enum';
import { EmailService } from '../common/services/email.service';
import { CreateFacilityResponse } from './interfaces/create-facility.response';

@Injectable()
export class FacilityService {
  constructor(
    @InjectModel(Facility)
    private readonly facilityModel: typeof Facility,
    private readonly usersService: UsersService,
    private readonly emailService: EmailService,
    @InjectConnection()
    private readonly sequelize: Sequelize,
  ) {}

  async create(createFacilityDto: CreateFacilityDto, owner: User): Promise<CreateFacilityResponse> {
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
          contractDocumentUrl: createFacilityDto.contractDocumentUrl ?? null,
          totalBranches: 0,
          totalResidents: 0,
          facilityAdminName: `${createFacilityDto.adminFirstName} ${createFacilityDto.adminLastName}`,
        },
        { transaction },
      );

      const facilityAdmin = await this.usersService.create(
        {
          firstName: createFacilityDto.adminFirstName,
          lastName: createFacilityDto.adminLastName,
          email: createFacilityDto.adminEmail,
          password: createFacilityDto.adminPassword,
          role: Role.FACILITY_ADMIN,
          facilityId: facility.id,
        },
        owner,
        transaction,
      );

      facility.facilityAdminId = facilityAdmin.id;
      facility.facilityAdminName = `${facilityAdmin.firstName} ${facilityAdmin.lastName}`;
      await facility.save({ transaction });

      await this.emailService.sendFacilityAdminCredentials(
        facilityAdmin.email,
        facilityAdmin.firstName,
        createFacilityDto.adminPassword,
        facility.name,
      );

      return {
        facility,
        facilityAdminTemporaryPassword: createFacilityDto.adminPassword,
      };
    });
  }

  async findAll(): Promise<Facility[]> {
    return this.facilityModel.findAll();
  }

  async findOne(id: string, currentUser: User): Promise<Facility | null> {
    const facility = await this.facilityModel.findByPk(id);
    if (!facility) {
      return null;
    }

    if (currentUser.role === Role.OWNER) {
      return facility;
    }

    // Facility/branch scoped roles can only read their own facility
    if (!currentUser.facilityId || facility.id !== currentUser.facilityId) {
      throw new ForbiddenException('Cannot access facilities outside your scope');
    }

    return facility;
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
}
