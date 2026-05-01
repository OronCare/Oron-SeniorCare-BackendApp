import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Vital } from './vital.model';
import { CreateVitalDto } from './dto/create-vital.dto';
import { Resident } from '../residents/resident.model';
import { Role } from '../common/enums/role.enum';
import { User } from '../users/user.model';
import { Rule } from '../rules/rule.model';
import { Task } from '../task/task.model';

type ThresholdLevel = 'NORMAL' | 'LOW' | 'HIGH' | 'CRITICAL_LOW' | 'CRITICAL_HIGH';

type ThresholdResult = {
  vitalType: string;
  value: number;
  unit: string;
  level: ThresholdLevel;
  ruleId: string;
  ruleName: string;
};

@Injectable()
export class VitalsService {
  constructor(
    @InjectModel(Vital)
    private readonly vitalModel: typeof Vital,
    @InjectModel(Resident)
    private readonly residentModel: typeof Resident,
    @InjectModel(Rule)
    private readonly ruleModel: typeof Rule,
    @InjectModel(Task)
    private readonly taskModel: typeof Task,
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

    const vital = await this.vitalModel.create({
      ...createVitalDto,
      residentId: resident.id,
      branchId: resident.branchId,
      facilityId: resident.facilityId,
      recordedById: currentUser.id || currentUser.sub,
      date: new Date(createVitalDto.date),
      thresholdEvaluation,
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
      } else if (value >= threshold.criticalHigh) {
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
}
