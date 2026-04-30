import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { TaskService } from './task.service';
import { TaskController } from './task.controller';
import { Task } from './task.model';
import { User } from '../users/user.model';
import { Branch } from '../branch/branch.model';
import { Resident } from '../residents/resident.model';
import { Facility } from '../facility/facility.model';

@Module({
  imports: [SequelizeModule.forFeature([Task, User, Branch, Resident, Facility])],
  controllers: [TaskController],
  providers: [TaskService],
})
export class TaskModule {}