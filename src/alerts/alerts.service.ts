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
import { OneSignalService } from '../notifications/one-signal.service';

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

interface TaskAssignedAlertContext {
  facilityId: string;
  branchId: string;
  residentId: string;
  assignedToUserId: string;
  title: string;
  dueDate?: string | Date;
  category?: string;
  description?: string;
  createdAt?: Date;
}

interface BranchUtilizationAlertContext {
  facilityId: string;
  branchId: string;
  branchName: string;
  residentLimit: number;
  currentResidents: number;
  utilizationPercent: number;
  createdAt?: Date;
}

@Injectable()
export class AlertsService {
  constructor(
    @InjectModel(Alert)
    private readonly alertModel: typeof Alert,
    private readonly oneSignalService: OneSignalService,
  ) {}

  async createFromBranchHighUtilization(
    context: BranchUtilizationAlertContext,
    transaction?: Transaction,
  ): Promise<void> {
    const utilization = Math.round(context.utilizationPercent);
    const severity: AlertSeverity = utilization >= 100 ? 'Critical' : 'Warning';

    const alertPayload = {
      facilityId: context.facilityId,
      branchId: context.branchId,
      residentId: null,
      title: 'High branch utilization',
      message: `${context.branchName} is at ${utilization}% capacity (${context.currentResidents}/${context.residentLimit}).`,
      severity,
      status: 'Unread' as AlertStatus,
      date: context.createdAt ?? new Date(),
      targetRoles: ['owner'],
      healthState: null,
      sourceVitalId: null,
    };

    await this.alertModel.create(alertPayload, { transaction });

    const pushItems = [
      {
        title: alertPayload.title,
        message: alertPayload.message,
        severity: alertPayload.severity,
      },
    ];

    const schedulePush = () => {
      void this.oneSignalService.notifyOwners(pushItems);
    };
    if (transaction) {
      transaction.afterCommit(schedulePush);
    } else {
      schedulePush();
    }
  }

  async createFromTaskAssignment(
    context: TaskAssignedAlertContext,
    transaction?: Transaction,
  ): Promise<void> {
    const due =
      context.dueDate !== undefined && context.dueDate !== null
        ? new Date(context.dueDate).toLocaleString()
        : undefined;

    const lines = [
      context.category ? `Category: ${context.category}` : undefined,
      due ? `Due: ${due}` : undefined,
      context.description ? context.description : undefined,
    ].filter(Boolean) as string[];

    const message = lines.length
      ? `${context.title} — ${lines.join(' • ')}`
      : context.title;

    await this.alertModel.create(
      {
        facilityId: context.facilityId,
        branchId: context.branchId,
        residentId: context.residentId,
        title: 'Task assigned',
        message,
        severity: 'Info',
        status: 'Unread',
        date: context.createdAt ?? new Date(),
        // Staff should see it in the header bell (/alerts).
        targetRoles: ['staff'],
        healthState: null,
        sourceVitalId: null,
      },
      { transaction },
    );
  }

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

    const hasCritical = abnormalities.some(
      (e) => e.level === 'CRITICAL_HIGH' || e.level === 'CRITICAL_LOW',
    );
    const severity: AlertSeverity = hasCritical ? 'Critical' : 'Warning';
    const status: AlertStatus = 'Unread';

    const messageLines = abnormalities
      .map((e) => this.formatAbnormality(e))
      .filter(Boolean);

    const title = `Vitals alert (${abnormalities.length})`;
    const message = `${context.residentName} recorded vitals outside the normal range: ${messageLines.join(
      '; ',
    )}.`;

    const alertPayload = {
      facilityId: context.facilityId,
      branchId: context.branchId,
      residentId: context.residentId,
      title,
      message,
      severity,
      status,
      date: context.measuredAt,
      targetRoles: ['admin', 'staff', 'facility_admin'],
      healthState: context.healthState ?? null,
      sourceVitalId: context.vitalId,
    };

    await this.alertModel.create(alertPayload, { transaction });

    const pushItems = [
      {
        title: alertPayload.title,
        message: alertPayload.message,
        severity: alertPayload.severity,
      },
    ];
    const facilityId = context.facilityId;
    const branchId = context.branchId;
    const schedulePush = () => {
      void this.oneSignalService.notifyNewAlerts(facilityId, branchId, pushItems);
    };
    if (transaction) {
      transaction.afterCommit(schedulePush);
    } else {
      schedulePush();
    }
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

  private formatAbnormality(evaluation: ThresholdResult): string {
    const vitalLabel = this.formatVitalName(evaluation.vitalType);
    const direction =
      evaluation.level === 'LOW' || evaluation.level === 'CRITICAL_LOW' ? 'low' : 'high';
    const criticalPrefix =
      evaluation.level === 'CRITICAL_HIGH' || evaluation.level === 'CRITICAL_LOW'
        ? 'CRITICAL '
        : '';
    const ruleSuffix = evaluation.ruleName ? ` (${evaluation.ruleName})` : '';
    return `${vitalLabel}: ${criticalPrefix}${direction} (${evaluation.value} ${evaluation.unit})${ruleSuffix}`;
  }
}
