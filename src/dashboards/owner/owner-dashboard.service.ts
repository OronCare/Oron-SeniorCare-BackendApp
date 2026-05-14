import { Injectable } from '@nestjs/common';
import { FacilityService } from '../../facility/facility.service';
import { BranchService } from '../../branch/branch.service';
import { ResidentsService } from '../../residents/residents.service';
import { AlertsService } from '../../alerts/alerts.service';
import { User } from '../../users/user.model';

@Injectable()
export class OwnerDashboardService {
  constructor(
    private readonly facilityService: FacilityService,
    private readonly branchService: BranchService,
    private readonly residentsService: ResidentsService,
    private readonly alertsService: AlertsService,
  ) {}

  /**
   * Aggregates owner-scoped lists for the platform overview in one round trip.
   * Facility / branch / staff dashboards can follow the same pattern under `dashboards/`.
   */
  async getSnapshot(currentUser: User) {
    const [facilities, branches, residents, alerts] = await Promise.all([
      this.facilityService.findAll(),
      this.branchService.findAll(currentUser),
      this.residentsService.findAll(currentUser),
      this.alertsService.findAll(currentUser),
    ]);

    return {
      facilities,
      branches,
      residents,
      alerts,
    };
  }
}
