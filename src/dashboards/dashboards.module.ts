import { Module } from '@nestjs/common';
import { FacilityModule } from '../facility/facility.module';
import { BranchModule } from '../branch/branch.module';
import { ResidentsModule } from '../residents/residents.module';
import { AlertsModule } from '../alerts/alerts.module';
import { OwnerDashboardController } from './owner/owner-dashboard.controller';
import { OwnerDashboardService } from './owner/owner-dashboard.service';

/**
 * Role-scoped dashboard aggregates. Add sibling folders (e.g. `facility/`, `branch/`, `staff/`)
 * and register their controllers here as new endpoints under `dashboards/*`.
 */
@Module({
  imports: [FacilityModule, BranchModule, ResidentsModule, AlertsModule],
  controllers: [OwnerDashboardController],
  providers: [OwnerDashboardService],
})
export class DashboardsModule {}
