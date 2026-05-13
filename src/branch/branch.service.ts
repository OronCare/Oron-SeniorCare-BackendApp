import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Transaction } from 'sequelize';
import { Branch } from './branch.model';
import { CreateBranchDto } from './dto/create-branch.dto';
import { User } from '../users/user.model';
import { Role } from '../common/enums/role.enum';
import { Facility } from '../facility/facility.model';
import { UsersService } from '../users/users.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { EmailService } from '../common/services/email.service';
import * as crypto from 'crypto';

@Injectable()
export class BranchService {
  constructor(
    private readonly usersService: UsersService,
    private readonly auditLogsService: AuditLogsService,
    private readonly emailService: EmailService,
    @InjectModel(Branch)
    private readonly branchModel: typeof Branch,
    @InjectModel(Facility)
    private readonly facilityModel: typeof Facility,
    @InjectConnection()
    private readonly sequelize: Sequelize,
  ) {}

  async create(
    createBranchDto: CreateBranchDto,
    currentUser: User,
    ipAddress?: string,
  ): Promise<Branch> {
    if (currentUser.role !== Role.OWNER) {
      throw new ForbiddenException('Only owners can create branches');
    }

    const facility = await this.facilityModel.findByPk(createBranchDto.facilityId);
    if (!facility) {
      throw new BadRequestException('Facility not found');
    }

    const branch = await this.sequelize.transaction(async (transaction: Transaction) => {
      const {
        branchAdminFirstName,
        branchAdminLastName,
        branchAdminEmail,
        branchAdminPassword,
        ...branchData
      } = createBranchDto;

      const branch = await this.branchModel.create(
        {
          ...branchData,
          currentResidents: 0,
        },
        { transaction },
      );

      // Create branch admin user for the new branch.
      const { user: branchAdmin, rawToken } = await this.usersService.createWithSetPasswordToken(
        {
          firstName: branchAdminFirstName,
          lastName: branchAdminLastName,
          email: branchAdminEmail,
          password: crypto.randomBytes(24).toString('base64url'),
          role: Role.BRANCH_ADMIN,
          facilityId: facility.id,
          branchId: branch.id,
        },
        currentUser,
        transaction,
      );

      branch.branchAdminId = branchAdmin.id;
      branch.branchAdminName = `${branchAdmin.firstName} ${branchAdmin.lastName}`;
      await branch.save({ transaction });
      const frontendBaseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const setPasswordUrl = `${frontendBaseUrl.replace(/\/$/, '')}/set-password?inviteCode=${encodeURIComponent(rawToken)}`;
      await this.emailService.sendSetPasswordLink(
        branchAdmin.email,
        branchAdmin.firstName,
        setPasswordUrl,
        branch.name,
      );

      facility.totalBranches += 1;
      await facility.save({ transaction });

      return branch;
    });

    const actorName = [currentUser.firstName, currentUser.middleName, currentUser.lastName]
      .filter(Boolean)
      .join(' ');
    if (currentUser.role !== Role.OWNER) {
      await this.auditLogsService.create({
        facilityId: branch.facilityId,
        branchId: branch.id,
        user: actorName,
        action: 'Branch Added',
        details: `Added new branch ${branch.name}`,
        ipAddress: ipAddress ?? null,
      });
    }

    return branch;
  }

  async findAll(currentUser: User): Promise<Branch[]> {
    if (currentUser.role === Role.OWNER) {
      return this.branchModel.findAll();
    }

    if (currentUser.role === Role.FACILITY_ADMIN) {
      if (!currentUser.facilityId) {
        return [];
      }
      return this.branchModel.findAll({
        where: { facilityId: currentUser.facilityId },
      });
    }

    throw new ForbiddenException('Only owner or facility admin can view branches');
  }

  async findOne(id: string, currentUser: User): Promise<Branch | null> {
    const branch = await this.branchModel.findByPk(id);
    if (!branch) {
      return null;
    }

    if (currentUser.role === Role.OWNER) {
      return branch;
    }

    if (currentUser.role === Role.FACILITY_ADMIN) {
      if (branch.facilityId !== currentUser.facilityId) {
        throw new ForbiddenException('Cannot access branches outside your facility');
      }
      return branch;
    }

    if (currentUser.role === Role.BRANCH_ADMIN || currentUser.role === Role.STAFF) {
      if (!currentUser.branchId || branch.id !== currentUser.branchId) {
        throw new ForbiddenException('Cannot access branches outside your scope');
      }
      return branch;
    }

    throw new ForbiddenException('Insufficient permissions to view branch details');
  }
}
