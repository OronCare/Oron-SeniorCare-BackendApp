import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { ResidentsController } from './residents.controller';
import { ResidentsService } from './residents.service';
import { Resident } from './resident.model';
import { Branch } from '../branch/branch.model';
import { Facility } from '../facility/facility.model';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [SequelizeModule.forFeature([Resident, Branch, Facility]), AuditLogsModule],
  controllers: [ResidentsController],
  providers: [ResidentsService],
})
export class ResidentsModule {}
