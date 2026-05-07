import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FacilityService } from './facility.service';
import { CreateFacilityDto } from './dto/create-facility.dto';
import { UpdateFacilityDto } from './dto/update-facility.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/user.model';
import { FileInterceptor } from '@nestjs/platform-express';
import { createMulterOptions } from '../common/utils/multer.util';

@Controller('facilities')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FacilityController {
  constructor(private readonly facilityService: FacilityService) {}

  @Post()
  @Roles(Role.OWNER)
  @UseInterceptors(
    FileInterceptor(
      'contractDocument',
      createMulterOptions('facilities/contracts', ['application/pdf'], 10 * 1024 * 1024),
    ),
  )
  async create(
    @Body() createFacilityDto: CreateFacilityDto,
    @CurrentUser() owner: User,
    @UploadedFile() contractDocument?: Express.Multer.File,
  ) {
    const normalizedDto = this.normalizeCreateDto(createFacilityDto);
    const contractDocumentUrl = contractDocument
      ? `/uploads/facilities/contracts/${contractDocument.filename}`
      : undefined;

    return this.facilityService.create(
      { ...normalizedDto, contractDocumentUrl },
      owner,
    );
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

  @Put(':id')
  @Roles(Role.OWNER)
  async update(
    @Param('id') id: string,
    @Body() updateFacilityDto: UpdateFacilityDto,
    @CurrentUser() owner: User,
  ) {
    return this.facilityService.update(id, updateFacilityDto, owner);
  }

  private normalizeCreateDto(createFacilityDto: CreateFacilityDto): CreateFacilityDto {
    if (!createFacilityDto.contractStart || !createFacilityDto.contractEnd) {
      throw new BadRequestException('Contract dates are required');
    }
    return createFacilityDto;
  }
}
