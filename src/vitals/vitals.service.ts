import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Transaction } from 'sequelize';
import { Vital } from './vital.model';
import { CreateVitalDto } from './dto/create-vital.dto';
import { Resident } from '../residents/resident.model';
import { Role } from '../common/enums/role.enum';
import { User } from '../users/user.model';
import { Rule } from '../rules/rule.model';
import { Task } from '../task/task.model';
import { encryptText, decryptText } from '../common/utils/encryption.util';
import { ResidentData } from '../residents/interfaces/resident-data.interface';
import {
  computeResidentClinicalStatus,
  type ThresholdLevel,
  type ThresholdResult,
} from './clinical-status.util';
import { AlertsService } from '../alerts/alerts.service';

@Injectable()
export class VitalsService {
  constructor(
    @InjectConnection()
    private readonly sequelize: Sequelize,
    @InjectModel(Vital)
    private readonly vitalModel: typeof Vital,
    @InjectModel(Resident)
    private readonly residentModel: typeof Resident,
    @InjectModel(Rule)
    private readonly ruleModel: typeof Rule,
    @InjectModel(Task)
    private readonly taskModel: typeof Task,
    private readonly alertsService: AlertsService,
  ) {}

  async create(createVitalDto: CreateVitalDto, currentUser: User): Promise<any> {
    if (currentUser.role !== Role.BRANCH_ADMIN && currentUser.role !== Role.STAFF) {
      throw new ForbiddenException('Only branch admin and staff can add vitals');
    }

    const resident = await this.residentModel.findByPk(createVitalDto.residentId);
    if (!resident) {
      throw new BadRequestException('Resident not found');
    }

    if (currentUser.role === Role.BRANCH_ADMIN) {
      if (!currentUser.branchId || resident.branchId !== currentUser.branchId) {
        throw new ForbiddenException(
          'Branch admin can only add vitals for residents in their own branch',
        );
      }
    }

    if (currentUser.role === Role.STAFF) {
      if (!currentUser.branchId || resident.branchId !== currentUser.branchId) {
        throw new ForbiddenException(
          'Staff can only add vitals for residents in their own branch',
        );
      }

      const assignment = await this.taskModel.findOne({
        where: {
          residentId: resident.id,
          assignedToId: currentUser.id,
          branchId: resident.branchId,
        },
      });

      if (!assignment) {
        throw new ForbiddenException(
          'Staff can only add vitals for residents assigned to them',
        );
      }
    }

    const thresholdEvaluation = await this.evaluateThresholds(createVitalDto);
    const evaluatedRuleKeys = Object.keys(thresholdEvaluation);

    let previousHealthState: string | null = null;
    try {
      const data = JSON.parse(decryptText(resident.encryptedData)) as ResidentData;
      previousHealthState = data.healthState ?? null;
    } catch {
      previousHealthState = null;
    }

    let clinicalHealthState: string | undefined;
    const thresholdEvaluationStored: Record<string, unknown> = { ...thresholdEvaluation };

    if (evaluatedRuleKeys.length > 0) {
      const clinical = computeResidentClinicalStatus(thresholdEvaluation, previousHealthState);
      clinicalHealthState = clinical.state;
      thresholdEvaluationStored.clinicalSummary = {
        clinicalHealthState: clinical.state,
        recommendedAction: clinical.action,
      };
    }
    const vitalDate = new Date(createVitalDto.date);

    const vital = await this.sequelize.transaction(async (transaction: Transaction) => {
      const created = await this.vitalModel.create(
        {
          ...createVitalDto,
          residentId: resident.id,
          branchId: resident.branchId,
          facilityId: resident.facilityId,
          recordedById: currentUser.id,
          date: vitalDate,
          thresholdEvaluation: thresholdEvaluationStored,
        },
        { transaction },
      );

      const residentData = JSON.parse(decryptText(resident.encryptedData)) as ResidentData;
      residentData.lastVitalsDate = vitalDate.toISOString();
      if (evaluatedRuleKeys.length > 0 && clinicalHealthState !== undefined) {
        residentData.healthState = clinicalHealthState;
      }
      resident.encryptedData = encryptText(JSON.stringify(residentData));
      await resident.save({ transaction });

      await this.alertsService.createFromVitalAbnormalities(
        {
          vitalId: created.id,
          facilityId: resident.facilityId,
          branchId: resident.branchId,
          residentId: resident.id,
          residentName: this.toResidentDisplayName(residentData),
          measuredAt: vitalDate,
          thresholdEvaluation,
          healthState: residentData.healthState,
        },
        transaction,
      );

      return created;
    });

    return this.buildVitalResponse(vital);
  }

  async findAll(currentUser: User): Promise<any[]> {
    const whereClause = this.buildWhereClause(currentUser);
    const vitals = await this.vitalModel.findAll({
      where: whereClause,
      order: [['date', 'DESC']],
    });

    return vitals.map((vital) => this.buildVitalResponse(vital));
  }

  async findByResident(residentId: string, currentUser: User): Promise<any[]> {
    const resident = await this.residentModel.findByPk(residentId);
    if (!resident) {
      throw new BadRequestException('Resident not found');
    }

    this.ensureResidentInScope(resident, currentUser);

    const vitals = await this.vitalModel.findAll({
      where: { residentId },
      order: [['date', 'DESC']],
    });

    return vitals.map((vital) => this.buildVitalResponse(vital));
  }

  private buildVitalResponse(vital: Vital): any {
    const te = (vital.thresholdEvaluation ?? {}) as Record<string, unknown>;
    const clinicalSummary = te.clinicalSummary as
      | { clinicalHealthState?: string; recommendedAction?: string }
      | undefined;

    return {
      id: vital.id,
      residentId: vital.residentId,
      branchId: vital.branchId,
      facilityId: vital.facilityId,
      recordedById: vital.recordedById,
      date: vital.date,
      systolicBP: vital.systolicBP,
      diastolicBP: vital.diastolicBP,
      heartRate: vital.heartRate,
      temperature: vital.temperature,
      oxygenSaturation: vital.oxygenSaturation,
      bloodSugar: vital.bloodSugar,
      weight: vital.weight,
      respiratoryRate: vital.respiratoryRate,
      notes: vital.notes,
      thresholdEvaluation: vital.thresholdEvaluation ?? {},
      clinicalHealthState: clinicalSummary?.clinicalHealthState,
      recommendedAction: clinicalSummary?.recommendedAction,
      createdAt: vital.createdAt,
      updatedAt: vital.updatedAt,
    };
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

  private ensureResidentInScope(resident: Resident, currentUser: User): void {
    if (currentUser.role === Role.OWNER) {
      return;
    }

    if (
      currentUser.role === Role.FACILITY_ADMIN &&
      resident.facilityId === currentUser.facilityId
    ) {
      return;
    }

    if (
      (currentUser.role === Role.BRANCH_ADMIN || currentUser.role === Role.STAFF) &&
      resident.branchId === currentUser.branchId
    ) {
      return;
    }

    throw new ForbiddenException('Cannot access vitals outside your scope');
  }

  private async evaluateThresholds(
    createVitalDto: CreateVitalDto,
  ): Promise<Record<string, ThresholdResult>> {
    const rules = await this.ruleModel.findAll({
      where: { isActive: true },
    });

    const measurements: Record<string, number | undefined> = {
      systolicBP: createVitalDto.systolicBP,
      diastolicBP: createVitalDto.diastolicBP,
      heartRate: createVitalDto.heartRate,
      temperature: createVitalDto.temperature,
      oxygenSaturation: createVitalDto.oxygenSaturation,
      bloodSugar: createVitalDto.bloodSugar,
      respiratoryRate: createVitalDto.respiratoryRate,
    };

    const result: Record<string, ThresholdResult> = {};

    for (const rule of rules) {
      const value = measurements[rule.vitalType];
      if (value === undefined || value === null) {
        continue;
      }

      const threshold = rule.thresholds;
      let level: ThresholdLevel = 'NORMAL';

      if (value <= threshold.criticalLow) {
        level = 'CRITICAL_LOW';
      } else if (
        threshold.criticalHigh > threshold.highThreshold &&
        value >= threshold.criticalHigh
      ) {
        level = 'CRITICAL_HIGH';
      } else if (value < threshold.lowThreshold) {
        level = 'LOW';
      } else if (value > threshold.highThreshold) {
        level = 'HIGH';
      }

      result[rule.vitalType] = {
        vitalType: rule.vitalType,
        value,
        unit: threshold.unit,
        level,
        ruleId: rule.id,
        ruleName: rule.name,
      };
    }

    return result;
  }

  private toResidentDisplayName(residentData: ResidentData): string {
    const pieces = [
      residentData.firstName,
      residentData.middleName ?? undefined,
      residentData.lastName,
    ].filter(Boolean);
    return pieces.join(' ');
  }
}
