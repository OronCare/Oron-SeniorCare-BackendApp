import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Role } from '../common/enums/role.enum';
import { User } from '../users/user.model';
import { Branch } from '../branch/branch.model';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { EmailService } from '../common/services/email.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';


@Injectable()
export class StaffService {
  constructor(
    @InjectModel(User)
    private readonly userModel: typeof User,
    @InjectModel(Branch)
    private readonly branchModel: typeof Branch,
    private readonly auditLogsService: AuditLogsService,
    private readonly emailService: EmailService,

  ) {}

  private hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  private mapStaffUser(user: User) {
    return {
      id: user.id,
      branchId: user.branchId || '',
      facilityId: user.facilityId || '',
      firstName: user.firstName,
      middleName: user.middleName || '',
      lastName: user.lastName,
      email: user.email,
      role: user.staffRole || 'Caregiver',
      status: user.staffStatus || 'Active',
      lastActive: user.lastActive ? new Date(user.lastActive).toISOString() : new Date().toISOString(),
      permissions: user.permissions || [],
    };
  }

  async create(
    createStaffDto: CreateStaffDto,
    currentUser: User,
    ipAddress?: string,
  ): Promise<any> {
    if (
      currentUser.role !== Role.FACILITY_ADMIN &&
      currentUser.role !== Role.BRANCH_ADMIN
    ) {
      throw new ForbiddenException(
        'Only facility admin and branch admin can create staff',
      );
    }

    const targetBranchId =
      currentUser.role === Role.BRANCH_ADMIN
        ? currentUser.branchId
        : createStaffDto.branchId;

    if (!targetBranchId) {
      throw new BadRequestException('branchId is required');
    }

    const branch = await this.branchModel.findByPk(targetBranchId);
    if (!branch) {
      throw new BadRequestException('Branch not found');
    }

    if (currentUser.role === Role.FACILITY_ADMIN) {
      if (!currentUser.facilityId) {
        throw new ForbiddenException('Facility admin is not assigned to a facility');
      }
      if (branch.facilityId !== currentUser.facilityId) {
        throw new ForbiddenException(
          'Facility admin can only create staff within their facility branches',
        );
      }
    }

    if (currentUser.role === Role.BRANCH_ADMIN) {
      if (!currentUser.branchId) {
        throw new ForbiddenException('Branch admin is not assigned to a branch');
      }
      if (branch.id !== currentUser.branchId) {
        throw new ForbiddenException(
          'Branch admin can only create staff in their own branch',
        );
      }
    }

    if (
      createStaffDto.facilityId &&
      createStaffDto.facilityId !== branch.facilityId
    ) {
      throw new BadRequestException(
        'Provided facilityId does not match selected branch facility',
      );
    }

    const existingStaff = await this.userModel.findOne({
      where: { email: createStaffDto.email },
    });
    if (existingStaff) {
      throw new BadRequestException('Staff email already exists');
    }

    const randomPassword = crypto.randomBytes(24).toString('base64url');
    const hashedPassword = await bcrypt.hash(randomPassword, 10);
    
    const createdStaff = await this.userModel.create({
      firstName: createStaffDto.firstName,
      middleName: createStaffDto.middleName ?? null,
      lastName: createStaffDto.lastName,
      email: createStaffDto.email,
      password: hashedPassword,
      role: Role.STAFF,
      branchId: targetBranchId,
      facilityId: branch.facilityId,
      staffRole: createStaffDto.role,
      staffStatus: createStaffDto.status,
      lastActive: createStaffDto.lastActive ? new Date(createStaffDto.lastActive) : null,
      permissions: createStaffDto.permissions,
    });

    const rawToken = crypto.randomBytes(32).toString('base64url');
    createdStaff.passwordSetTokenHash = this.hashToken(rawToken);
    createdStaff.passwordSetTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
    createdStaff.passwordSetTokenUsedAt = null;
    await createdStaff.save();

    const frontendBaseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const setPasswordUrl = `${frontendBaseUrl.replace(/\/$/, '')}/set-password?token=${encodeURIComponent(rawToken)}`;
    await this.emailService.sendSetPasswordLink(
      createdStaff.email,
      createdStaff.firstName,
      setPasswordUrl,
      branch.name,
    );

    const actorName = [currentUser.firstName, currentUser.middleName, currentUser.lastName]
      .filter(Boolean)
      .join(' ');
    const staffName = [createdStaff.firstName, createdStaff.middleName, createdStaff.lastName]
      .filter(Boolean)
      .join(' ');
    await this.auditLogsService.create({
      facilityId: createdStaff.facilityId,
      branchId: createdStaff.branchId,
      user: actorName,
      action: 'Staff Created',
      details: `Created account for ${staffName}`,
      ipAddress: ipAddress ?? null,
    });

    return this.mapStaffUser(createdStaff);
  }

  async findAll(currentUser: User): Promise<any[]> {
    switch (currentUser.role) {
      case Role.OWNER:
        return (await this.userModel.findAll({
          where: { role: Role.STAFF },
          order: [['createdAt', 'DESC']],
        })).map((user) => this.mapStaffUser(user));
      case Role.FACILITY_ADMIN: {
        if (!currentUser.facilityId) {
          return [];
        }
        return (await this.userModel.findAll({
          where: { role: Role.STAFF, facilityId: currentUser.facilityId },
          order: [['createdAt', 'DESC']],
        })).map((user) => this.mapStaffUser(user));
      }
      case Role.BRANCH_ADMIN:
      case Role.STAFF: {
        if (!currentUser.branchId) {
          return [];
        }
        return (await this.userModel.findAll({
          where: { role: Role.STAFF, branchId: currentUser.branchId },
          order: [['createdAt', 'DESC']],
        })).map((user) => this.mapStaffUser(user));
      }
      default:
        return [];
    }
  }

  async findOne(id: string, currentUser: User): Promise<any | null> {
    const staff = await this.userModel.findOne({ where: { id, role: Role.STAFF } });
    if (!staff) {
      return null;
    }

    if (currentUser.role === Role.OWNER) {
      return this.mapStaffUser(staff);
    }

    if (currentUser.role === Role.FACILITY_ADMIN) {
      if (staff.facilityId !== currentUser.facilityId) {
        throw new ForbiddenException('Cannot access staff outside your facility');
      }
      return this.mapStaffUser(staff);
    }

    if (currentUser.role === Role.BRANCH_ADMIN || currentUser.role === Role.STAFF) {
      if (staff.branchId !== currentUser.branchId) {
        throw new ForbiddenException('Cannot access staff outside your branch');
      }
      return this.mapStaffUser(staff);
    }

    throw new ForbiddenException('Insufficient permissions to access staff');
  }

  async updateStaff(
    id: string,
    updateStaffDto: UpdateStaffDto,
    currentUser: User,
  ): Promise<any | null> {
    if (
      currentUser.role !== Role.FACILITY_ADMIN &&
      currentUser.role !== Role.BRANCH_ADMIN
    ) {
      throw new ForbiddenException(
        'Only facility admin and branch admin can update staff',
      );
    }

    const staff = await this.userModel.findOne({ where: { id, role: Role.STAFF } });
    if (!staff) {
      return null;
    }

    if (currentUser.role === Role.FACILITY_ADMIN) {
      if (!currentUser.facilityId || staff.facilityId !== currentUser.facilityId) {
        throw new ForbiddenException('Cannot update staff outside your facility');
      }
    }

    if (currentUser.role === Role.BRANCH_ADMIN) {
      if (!currentUser.branchId || staff.branchId !== currentUser.branchId) {
        throw new ForbiddenException('Cannot update staff outside your branch');
      }
    }

    const updatePayload: Partial<User> = {
      firstName: updateStaffDto.firstName ?? staff.firstName,
      middleName:
        updateStaffDto.middleName !== undefined
          ? updateStaffDto.middleName
          : staff.middleName,
      lastName: updateStaffDto.lastName ?? staff.lastName,
      staffRole: updateStaffDto.role ?? staff.staffRole,
      staffStatus: updateStaffDto.status ?? staff.staffStatus,
      permissions: updateStaffDto.permissions ?? staff.permissions,
    };

    if (updateStaffDto.lastActive !== undefined) {
      updatePayload.lastActive = new Date(updateStaffDto.lastActive);
    }

    await staff.update(updatePayload);
    return this.mapStaffUser(staff);
  }
}
