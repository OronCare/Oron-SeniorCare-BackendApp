import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Transaction } from 'sequelize';
import { Resident } from './resident.model';
import { Branch } from '../branch/branch.model';
import { Facility } from '../facility/facility.model';
import { User } from '../users/user.model';
import { CreateResidentDto } from './dto/create-resident.dto';
import { UpdateResidentDto } from './dto/update-resident.dto';
import { encryptText, decryptText } from '../common/utils/encryption.util';
import { ResidentData } from './interfaces/resident-data.interface';
import { Role } from '../common/enums/role.enum';

@Injectable()
export class ResidentsService {
  constructor(
    @InjectModel(Resident)
    private readonly residentModel: typeof Resident,
    @InjectModel(Branch)
    private readonly branchModel: typeof Branch,
    @InjectModel(Facility)
    private readonly facilityModel: typeof Facility,
    @InjectConnection()
    private readonly sequelize: Sequelize,
  ) {}

  async create(createResidentDto: CreateResidentDto, currentUser: User): Promise<any> {
    this.validateCreatePermissions(currentUser);

    const branch = await this.branchModel.findByPk(createResidentDto.branchId);
    if (!branch) {
      throw new BadRequestException('Branch not found');
    }

    const facility = await this.facilityModel.findByPk(createResidentDto.facilityId);
    if (!facility) {
      throw new BadRequestException('Facility not found');
    }

    if (branch.facilityId !== facility.id) {
      throw new BadRequestException('Branch does not belong to the selected facility');
    }

    this.validateOwnershipForCreate(currentUser, branch, facility);

    const encryptedData = encryptText(JSON.stringify(createResidentDto));

    return this.sequelize.transaction(async (transaction: Transaction) => {
      const resident = await this.residentModel.create(
        {
          branchId: createResidentDto.branchId,
          facilityId: createResidentDto.facilityId,
          encryptedData,
        },
        { transaction },
      );

      branch.currentResidents += 1;
      facility.totalResidents += 1;

      await Promise.all([
        branch.save({ transaction }),
        facility.save({ transaction }),
      ]);

      return this.buildResidentResponse(resident);
    });
  }

  async findAll(currentUser: User): Promise<any[]> {
    const whereClause = this.buildWhereClause(currentUser);
    const residents = await this.residentModel.findAll({ where: whereClause });
    return residents.map(resident => this.buildResidentResponse(resident));
  }

  async findOne(id: string, currentUser: User): Promise<any> {
    const resident = await this.residentModel.findByPk(id);
    if (!resident) {
      return null;
    }

    this.ensureViewPermission(resident, currentUser);
    return this.buildResidentResponse(resident);
  }

  async update(id: string, updateResidentDto: UpdateResidentDto, currentUser: User): Promise<any> {
    const resident = await this.residentModel.findByPk(id);
    if (!resident) {
      throw new BadRequestException('Resident not found');
    }

    if (!this.canManageResident(currentUser, resident)) {
      throw new ForbiddenException('Insufficient permissions to update resident');
    }

    const oldBranch = await this.branchModel.findByPk(resident.branchId);
    const oldFacility = await this.facilityModel.findByPk(resident.facilityId);

    let branch = oldBranch;
    let facility = oldFacility;

    if (updateResidentDto.branchId) {
      branch = await this.branchModel.findByPk(updateResidentDto.branchId);
      if (!branch) {
        throw new BadRequestException('Branch not found');
      }
    }

    if (updateResidentDto.facilityId) {
      facility = await this.facilityModel.findByPk(updateResidentDto.facilityId);
      if (!facility) {
        throw new BadRequestException('Facility not found');
      }
    }

    if (branch && facility && branch.facilityId !== facility.id) {
      throw new BadRequestException('Branch does not belong to the selected facility');
    }

    const currentData = this.decryptResidentData(resident.encryptedData);
    const mergedData = {
      ...currentData,
      ...updateResidentDto,
    } as ResidentData;

    return this.sequelize.transaction(async (transaction: Transaction) => {
      if (branch && oldBranch && branch.id !== oldBranch.id) {
        oldBranch.currentResidents = Math.max(0, oldBranch.currentResidents - 1);
        branch.currentResidents += 1;
      }

      if (facility && oldFacility && facility.id !== oldFacility.id) {
        oldFacility.totalResidents = Math.max(0, oldFacility.totalResidents - 1);
        facility.totalResidents += 1;
      }

      resident.branchId = updateResidentDto.branchId ?? resident.branchId;
      resident.facilityId = updateResidentDto.facilityId ?? resident.facilityId;
      resident.encryptedData = encryptText(JSON.stringify(mergedData));

      await Promise.all([
        oldBranch?.save({ transaction }),
        branch?.save({ transaction }),
        oldFacility?.save({ transaction }),
        facility?.save({ transaction }),
        resident.save({ transaction }),
      ]);

      return this.buildResidentResponse(resident);
    });
  }

  async delete(id: string, currentUser: User): Promise<boolean> {
    const resident = await this.residentModel.findByPk(id);
    if (!resident) {
      throw new BadRequestException('Resident not found');
    }

    if (!this.canManageResident(currentUser, resident)) {
      throw new ForbiddenException('Insufficient permissions to delete resident');
    }

    const branch = await this.branchModel.findByPk(resident.branchId);
    const facility = await this.facilityModel.findByPk(resident.facilityId);

    return this.sequelize.transaction(async (transaction: Transaction) => {
      const result = await this.residentModel.destroy({ where: { id }, transaction });

      if (result > 0) {
        if (branch) {
          branch.currentResidents = Math.max(0, branch.currentResidents - 1);
          await branch.save({ transaction });
        }

        if (facility) {
          facility.totalResidents = Math.max(0, facility.totalResidents - 1);
          await facility.save({ transaction });
        }
      }

      return result > 0;
    });
  }

  private buildResidentResponse(resident: Resident): any {
    return {
      id: resident.id,
      branchId: resident.branchId,
      facilityId: resident.facilityId,
      ...this.decryptResidentData(resident.encryptedData),
      createdAt: resident.createdAt,
      updatedAt: resident.updatedAt,
    };
  }

  private decryptResidentData(encryptedData: string): ResidentData {
    return JSON.parse(decryptText(encryptedData)) as ResidentData;
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

  private ensureViewPermission(resident: Resident, currentUser: User): void {
    if (currentUser.role === Role.OWNER) {
      return;
    }

    if (currentUser.role === Role.FACILITY_ADMIN && resident.facilityId === currentUser.facilityId) {
      return;
    }

    if ((currentUser.role === Role.BRANCH_ADMIN || currentUser.role === Role.STAFF) && resident.branchId === currentUser.branchId) {
      return;
    }

    throw new ForbiddenException('Cannot access resident outside your scope');
  }

  private canManageResident(currentUser: User, resident: Resident): boolean {
    if (currentUser.role === Role.OWNER) {
      return true;
    }

    if (currentUser.role === Role.FACILITY_ADMIN) {
      return resident.facilityId === currentUser.facilityId;
    }

    if (currentUser.role === Role.BRANCH_ADMIN) {
      return resident.branchId === currentUser.branchId;
    }

    return false;
  }

  private validateCreatePermissions(currentUser: User): void {
    if (
      currentUser.role !== Role.OWNER &&
      currentUser.role !== Role.FACILITY_ADMIN &&
      currentUser.role !== Role.BRANCH_ADMIN
    ) {
      throw new ForbiddenException('Insufficient permissions to create resident');
    }
  }

  private validateOwnershipForCreate(currentUser: User, branch: Branch, facility: Facility): void {
    if (currentUser.role === Role.FACILITY_ADMIN && currentUser.facilityId !== facility.id) {
      throw new ForbiddenException('Cannot create resident outside your facility');
    }

    if (currentUser.role === Role.BRANCH_ADMIN && currentUser.branchId !== branch.id) {
      throw new ForbiddenException('Cannot create resident outside your branch');
    }
  }
}
