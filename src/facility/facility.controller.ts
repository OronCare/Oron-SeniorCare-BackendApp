import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { FacilityService } from './facility.service';
import { CreateFacilityDto } from './dto/create-facility.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/user.model';

@Controller('facilities')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FacilityController {
  constructor(private readonly facilityService: FacilityService) {}

  @Post()
  @Roles(Role.OWNER)
  async create(@Body() createFacilityDto: CreateFacilityDto, @CurrentUser() owner: User) {
    return this.facilityService.create(createFacilityDto, owner);
  }

  @Get()
  @Roles(Role.OWNER)
  async findAll() {
    return this.facilityService.findAll();
  }

  @Get(':id')
  @Roles(Role.OWNER)
  async findOne(@Param('id') id: string) {
    return this.facilityService.findOne(id);
  }
}
