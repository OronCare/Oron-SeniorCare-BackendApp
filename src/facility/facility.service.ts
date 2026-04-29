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

  async findOne(id: string): Promise<Facility | null> {
    return this.facilityModel.findByPk(id);
  }
}
