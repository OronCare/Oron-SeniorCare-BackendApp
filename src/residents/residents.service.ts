import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Resident } from './resident.model';
import { Branch } from '../branch/branch.model';
import { Facility } from '../facility/facility.model';
import { User } from '../users/user.model';
import { CreateResidentDto } from './dto/create-resident.dto';
import { UpdateResidentDto } from './dto/update-resident.dto';
import { encryptText, decryptText } from '../common/utils/encryption.util';
import { ResidentData } from './interfaces/resident-data.interface';
import { Role } from '../common/enums/role.enum';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@Injectable()
export class ResidentsService {
  constructor(
    @InjectModel(Resident)
    private readonly residentModel: typeof Resident,
    @InjectModel(Branch)
    private readonly branchModel: typeof Branch,
    @InjectModel(Facility)
    private readonly facilityModel: typeof Facility,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async create(
    createResidentDto: CreateResidentDto,
    currentUser: User,
    ipAddress?: string,
  ): Promise<any> {
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
    const resident = await this.residentModel.create({
      branchId: createResidentDto.branchId,
      facilityId: createResidentDto.facilityId,
      encryptedData,
    });
    const actorName = [currentUser.firstName, currentUser.middleName, currentUser.lastName]
      .filter(Boolean)
      .join(' ');
    const residentName = [
      createResidentDto.firstName,
      createResidentDto.middleName,
      createResidentDto.lastName,
    ]
      .filter(Boolean)
      .join(' ');
    if (currentUser.role !== Role.OWNER) {
      await this.auditLogsService.create({
        facilityId: resident.facilityId,
        branchId: resident.branchId,
        user: actorName,
        action: 'Resident Added',
        details: `Added new resident ${residentName}`,
        ipAddress: ipAddress ?? null,
      });
    }

    return this.buildResidentResponse(resident);
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

    let branch = await this.branchModel.findByPk(resident.branchId);
    let facility = await this.facilityModel.findByPk(resident.facilityId);

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

    resident.branchId = updateResidentDto.branchId ?? resident.branchId;
    resident.facilityId = updateResidentDto.facilityId ?? resident.facilityId;
    resident.encryptedData = encryptText(JSON.stringify(mergedData));

    await resident.save();
    return this.buildResidentResponse(resident);
  }

  async delete(id: string, currentUser: User): Promise<boolean> {
    const resident = await this.residentModel.findByPk(id);
    if (!resident) {
      throw new BadRequestException('Resident not found');
    }

    if (!this.canManageResident(currentUser, resident)) {
      throw new ForbiddenException('Insufficient permissions to delete resident');
    }

    const result = await this.residentModel.destroy({ where: { id } });
    return result > 0;
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
