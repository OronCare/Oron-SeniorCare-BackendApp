import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { Alert } from './alert.model';
import { Facility } from '../facility/facility.model';
import { NotificationsModule } from '../notifications/notifications.module';
import { ContractExpiryScheduler } from './contract-expiry.scheduler';

@Module({
  imports: [SequelizeModule.forFeature([Alert, Facility]), NotificationsModule],
  controllers: [AlertsController],
  providers: [AlertsService, ContractExpiryScheduler],
  exports: [AlertsService],
})
export class AlertsModule {}
