import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { ResidentsController } from './residents.controller';
import { ResidentsService } from './residents.service';
import { Resident } from './resident.model';
import { Branch } from '../branch/branch.model';
import { Facility } from '../facility/facility.model';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [SequelizeModule.forFeature([Resident, Branch, Facility]), AuditLogsModule, StorageModule],
  controllers: [ResidentsController],
  providers: [ResidentsService],
})
export class ResidentsModule {}
