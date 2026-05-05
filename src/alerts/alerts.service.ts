import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Transaction } from 'sequelize';
import { Alert, AlertStatus, AlertSeverity } from './alert.model';
import { User } from '../users/user.model';
import { Role } from '../common/enums/role.enum';
import { ThresholdResult } from '../vitals/clinical-status.util';

interface VitalAlertContext {
  vitalId: string;
  facilityId: string;
  branchId: string;
  residentId: string;
  residentName: string;
  measuredAt: Date;
  thresholdEvaluation: Record<string, ThresholdResult>;
  healthState?: string;
}

@Injectable()
export class AlertsService {
  constructor(
    @InjectModel(Alert)
    private readonly alertModel: typeof Alert,
  ) {}

  async createFromVitalAbnormalities(
    context: VitalAlertContext,
    transaction?: Transaction,
  ): Promise<void> {
    const abnormalities = Object.values(context.thresholdEvaluation).filter(
      (evaluation) => evaluation.level !== 'NORMAL',
    );

    if (abnormalities.length === 0) {
      return;
    }

    const alertsPayload = abnormalities.map((evaluation) => {
      const severity: AlertSeverity =
        evaluation.level === 'CRITICAL_HIGH' || evaluation.level === 'CRITICAL_LOW'
          ? 'Critical'
          : 'Warning';

      const status: AlertStatus = 'Unread';

      return {
        facilityId: context.facilityId,
        branchId: context.branchId,
        residentId: context.residentId,
        title: this.buildAlertTitle(evaluation),
        message: this.buildAlertMessage(context.residentName, evaluation),
        severity,
        status,
        date: context.measuredAt,
        targetRoles: ['admin', 'staff', 'facility_admin'],
        healthState: context.healthState ?? null,
        sourceVitalId: context.vitalId,
      };
    });

    await this.alertModel.bulkCreate(alertsPayload, { transaction });
  }

  async findAll(currentUser: User): Promise<Alert[]> {
    const whereClause = this.buildWhereClause(currentUser);
    const roleFilter = this.toTargetRole(currentUser.role);

    return this.alertModel.findAll({
      where: whereClause,
      order: [['date', 'DESC']],
    }).then((alerts) => alerts.filter((alert) => alert.targetRoles.includes(roleFilter)));
  }

  async updateStatus(
    id: string,
    status: AlertStatus,
    currentUser: User,
  ): Promise<Alert> {
    const alert = await this.alertModel.findByPk(id);
    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    const scoped = this.isAlertInScope(alert, currentUser);
    if (!scoped) {
      throw new ForbiddenException('Cannot update alerts outside your scope');
    }

    await alert.update({ status });
    return alert;
  }

  private buildWhereClause(currentUser: User): Record<string, unknown> {
    switch (currentUser.role) {
      case Role.OWNER:
        return {};
      case Role.FACILITY_ADMIN:
        return { facilityId: currentUser.facilityId };
      case Role.BRANCH_ADMIN:
      case Role.STAFF:
        return { branchId: currentUser.branchId };
      default:
        return {};
    }
  }

  private isAlertInScope(alert: Alert, currentUser: User): boolean {
    if (currentUser.role === Role.OWNER) {
      return true;
    }
    if (currentUser.role === Role.FACILITY_ADMIN) {
      return alert.facilityId === currentUser.facilityId;
    }
    return alert.branchId === currentUser.branchId;
  }

  private toTargetRole(role: Role): string {
    switch (role) {
      case Role.OWNER:
        return 'owner';
      case Role.FACILITY_ADMIN:
        return 'facility_admin';
      case Role.BRANCH_ADMIN:
        return 'admin';
      case Role.STAFF:
        return 'staff';
      default:
        return 'staff';
    }
  }

  private buildAlertTitle(evaluation: ThresholdResult): string {
    const vitalLabel = this.formatVitalName(evaluation.vitalType);
    if (evaluation.level === 'CRITICAL_HIGH' || evaluation.level === 'HIGH') {
      return `High ${vitalLabel}`;
    }
    return `Low ${vitalLabel}`;
  }

  private buildAlertMessage(residentName: string, evaluation: ThresholdResult): string {
    const relation =
      evaluation.level === 'CRITICAL_HIGH' || evaluation.level === 'HIGH'
        ? 'above'
        : 'below';

    return `${residentName} recorded ${this.formatVitalName(evaluation.vitalType)} of ${
      evaluation.value
    } ${evaluation.unit}, ${relation} threshold (${evaluation.ruleName}).`;
  }

  private formatVitalName(vitalType: string): string {
    const labels: Record<string, string> = {
      systolicBP: 'Systolic BP',
      diastolicBP: 'Diastolic BP',
      heartRate: 'Heart Rate',
      temperature: 'Temperature',
      oxygenSaturation: 'Oxygen Saturation',
      bloodSugar: 'Blood Sugar',
      respiratoryRate: 'Respiratory Rate',
    };
    return labels[vitalType] ?? vitalType;
  }
}
