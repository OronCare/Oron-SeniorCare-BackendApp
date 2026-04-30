import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { Task } from './task.model';
import { User } from '../users/user.model';
import { Branch } from '../branch/branch.model';
import { Resident } from '../residents/resident.model';
import { Facility } from '../facility/facility.model';
import { Role } from '../common/enums/role.enum';

@Injectable()
export class TaskService {
  constructor(
    @InjectModel(Task)
    private taskModel: typeof Task,
    @InjectModel(User)
    private userModel: typeof User,
    @InjectModel(Branch)
    private branchModel: typeof Branch,
    @InjectModel(Resident)
    private residentModel: typeof Resident,
    @InjectModel(Facility)
    private facilityModel: typeof Facility,
  ) {}

  async create(createTaskDto: CreateTaskDto, user: User) {
    if (user.role !== Role.BRANCH_ADMIN) {
      throw new ForbiddenException('Only branch admins can create tasks');
    }

    if (createTaskDto.branchId !== user.branchId) {
      throw new ForbiddenException('You can only create tasks for your branch');
    }

    const assignedUser = await this.userModel.findOne({
      where: { id: createTaskDto.assignedToId },
    });
    if (!assignedUser || assignedUser.role !== Role.STAFF || assignedUser.branchId !== createTaskDto.branchId) {
      throw new ForbiddenException('Assigned user must be a staff member in your branch');
    }

    const resident = await this.residentModel.findOne({
      where: { id: createTaskDto.residentId },
    });
    if (!resident || resident.branchId !== createTaskDto.branchId) {
      throw new ForbiddenException('Resident must belong to the branch');
    }

    const branch = await this.branchModel.findOne({ where: { id: createTaskDto.branchId } });
    if (!branch || branch.facilityId !== createTaskDto.facilityId) {
      throw new BadRequestException('Branch and facility do not match');
    }

    const facility = await this.facilityModel.findOne({ where: { id: createTaskDto.facilityId } });
    if (!facility) {
      throw new BadRequestException('Facility not found');
    }

    return this.taskModel.create({
      ...createTaskDto,
      createdById: user.id,
      dueDate: new Date(createTaskDto.dueDate),
    } as any);

  }

  async findAll(user: User) {
    const whereClause: any = {};

    if (user.role === Role.STAFF) {
      whereClause.assignedToId = user.id;
    } else if (user.role === Role.BRANCH_ADMIN) {
      whereClause.branchId = user.branchId;
    } else if (user.role === Role.FACILITY_ADMIN) {
      whereClause.facilityId = user.facilityId;
    }

    return this.taskModel.findAll({ where: whereClause });
  }

  async findOne(id: string, user: User) {
    const task = await this.taskModel.findByPk(id);
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (user.role === Role.STAFF && task.assignedToId !== user.id) {
      throw new ForbiddenException('You can only view your own tasks');
    }
    if (user.role === Role.BRANCH_ADMIN && task.branchId !== user.branchId) {
      throw new ForbiddenException('You can only view tasks in your branch');
    }
    if (user.role === Role.FACILITY_ADMIN && task.facilityId !== user.facilityId) {
      throw new ForbiddenException('You can only view tasks in your facility');
    }

    return task;
  }

  async update(id: string, updateTaskDto: UpdateTaskDto, user: User) {
    const task = await this.findOne(id, user);

    if (user.role !== Role.BRANCH_ADMIN && task.createdById !== user.id) {
      throw new ForbiddenException('You can only update tasks you created');
    }

    const updatePayload: any = { ...updateTaskDto };
    if (updatePayload.dueDate) {
      updatePayload.dueDate = new Date(updatePayload.dueDate);
    }

    await task.update(updatePayload);
    return task;
  }

  async remove(id: string, user: User) {
    const task = await this.findOne(id, user);

    if (user.role !== Role.BRANCH_ADMIN && task.createdById !== user.id) {
      throw new ForbiddenException('You can only delete tasks you created');
    }

    await task.destroy();
    return { deleted: true };
  }
}