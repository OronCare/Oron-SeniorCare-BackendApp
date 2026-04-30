import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { AuditLog } from './audit-log.model';
import { User } from '../users/user.model';
import { Role } from '../common/enums/role.enum';

type CreateAuditLogInput = {
  facilityId?: string | null;
  branchId?: string | null;
  user: string;
  action: string;
  details: string;
  ipAddress?: string | null;
  timestamp?: Date;
};

@Injectable()
export class AuditLogsService {
  constructor(
    @InjectModel(AuditLog)
    private readonly auditLogModel: typeof AuditLog,
  ) {}

  async create(input: CreateAuditLogInput): Promise<AuditLog> {
    return this.auditLogModel.create({
      facilityId: input.facilityId ?? null,
      branchId: input.branchId ?? null,
      timestamp: input.timestamp ?? new Date(),
      user: input.user,
      action: input.action,
      details: input.details,
      ipAddress: input.ipAddress ?? null,
    });
  }

  async findAll(currentUser: User): Promise<AuditLog[]> {
    if (currentUser.role === Role.OWNER) {
      return this.auditLogModel.findAll({ order: [['timestamp', 'DESC']] });
    }

    if (currentUser.role === Role.FACILITY_ADMIN && currentUser.facilityId) {
      return this.auditLogModel.findAll({
        where: { facilityId: currentUser.facilityId },
        order: [['timestamp', 'DESC']],
      });
    }

    if (
      (currentUser.role === Role.BRANCH_ADMIN || currentUser.role === Role.STAFF) &&
      currentUser.branchId
    ) {
      return this.auditLogModel.findAll({
        where: { branchId: currentUser.branchId },
        order: [['timestamp', 'DESC']],
      });
    }

    return [];
  }
}
