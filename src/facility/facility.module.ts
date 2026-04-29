import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { UsersModule } from '../users/users.module';
import { FacilityController } from './facility.controller';
import { FacilityService } from './facility.service';
import { Facility } from './facility.model';
import { EmailService } from '../common/services/email.service';

@Module({
  imports: [SequelizeModule.forFeature([Facility]), UsersModule],
  controllers: [FacilityController],
  providers: [FacilityService, EmailService],
})
export class FacilityModule {}
