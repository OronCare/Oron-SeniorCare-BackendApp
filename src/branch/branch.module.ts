import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { BranchController } from './branch.controller';
import { BranchService } from './branch.service';
import { Branch } from './branch.model';
import { Facility } from '../facility/facility.model';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [SequelizeModule.forFeature([Branch, Facility]), UsersModule],
  controllers: [BranchController],
  providers: [BranchService],
})
export class BranchModule {}
