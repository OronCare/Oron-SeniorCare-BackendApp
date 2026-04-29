import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { ResidentsController } from './residents.controller';
import { ResidentsService } from './residents.service';
import { Resident } from './resident.model';
import { Branch } from '../branch/branch.model';
import { Facility } from '../facility/facility.model';

@Module({
  imports: [SequelizeModule.forFeature([Resident, Branch, Facility])],
  controllers: [ResidentsController],
  providers: [ResidentsService],
})
export class ResidentsModule {}
