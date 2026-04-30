import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';
import { Branch } from '../branch/branch.model';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { User } from '../users/user.model';

@Module({
  imports: [SequelizeModule.forFeature([User, Branch]), AuditLogsModule],
  controllers: [StaffController],
  providers: [StaffService],
})
export class StaffModule {}
