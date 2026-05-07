import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ResidentsService } from './residents.service';
import { CreateResidentDto } from './dto/create-resident.dto';
import { UpdateResidentDto } from './dto/update-resident.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/user.model';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { createMulterOptions } from '../common/utils/multer.util';

@ApiTags('Residents')
@ApiBearerAuth()
@Controller('residents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ResidentsController {
  constructor(private readonly residentsService: ResidentsService) {}

  private getClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    if (Array.isArray(forwarded) && forwarded[0]) {
      return forwarded[0];
    }
    return req.ip ?? '';
  }

  @Post()
  @Roles(Role.OWNER, Role.FACILITY_ADMIN, Role.BRANCH_ADMIN)
  @UseInterceptors(
    FileInterceptor(
      'residentPhoto',
      createMulterOptions('residents', ['image/jpeg', 'image/png', 'image/webp'], 5 * 1024 * 1024),
    ),
  )
  @ApiOperation({ summary: 'Create a new resident record' })
  @ApiResponse({ status: 201, description: 'Resident created successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  async create(
    @Body() createResidentDto: CreateResidentDto,
    @CurrentUser() currentUser: User,
    @Req() req: Request,
    @UploadedFile() residentPhoto?: Express.Multer.File,
  ) {
    const normalizedCreateDto = this.normalizeCreateDto(createResidentDto);
    const residentPhotoUrl = residentPhoto ? `/uploads/residents/${residentPhoto.filename}` : undefined;

    return this.residentsService.create(
      normalizedCreateDto,
      currentUser,
      this.getClientIp(req),
      residentPhotoUrl,
    );
  }

  private normalizeCreateDto(createResidentDto: CreateResidentDto): CreateResidentDto {
    let normalizedContacts: unknown = createResidentDto.emergencyContacts;
    if (typeof createResidentDto.emergencyContacts === 'string') {
      try {
        normalizedContacts = JSON.parse(createResidentDto.emergencyContacts);
      } catch {
        throw new BadRequestException('Emergency contacts must be valid JSON');
      }
    }

    if (!Array.isArray(normalizedContacts)) {
      throw new BadRequestException('Emergency contacts must be an array');
    }

    const normalizedWeight = Number(createResidentDto.weight);
    if (Number.isNaN(normalizedWeight) || normalizedWeight < 0) {
      throw new BadRequestException('Weight must be a valid positive number');
    }

    return {
      ...createResidentDto,
      weight: normalizedWeight,
      emergencyContacts: normalizedContacts as CreateResidentDto['emergencyContacts'],
    };
  }

  @Get()
  @Roles(Role.OWNER, Role.FACILITY_ADMIN, Role.BRANCH_ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Get all residents in scope' })
  @ApiResponse({ status: 200, description: 'Residents retrieved successfully' })
  async findAll(@CurrentUser() currentUser: User) {
    return this.residentsService.findAll(currentUser);
  }

  @Get(':id')
  @Roles(Role.OWNER, Role.FACILITY_ADMIN, Role.BRANCH_ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Get a resident by ID' })
  @ApiResponse({ status: 200, description: 'Resident retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  async findOne(@Param('id') id: string, @CurrentUser() currentUser: User) {
    return this.residentsService.findOne(id, currentUser);
  }

  @Put(':id')
  @Roles(Role.OWNER, Role.FACILITY_ADMIN, Role.BRANCH_ADMIN)
  @UseInterceptors(
    FileInterceptor(
      'residentPhoto',
      createMulterOptions('residents', ['image/jpeg', 'image/png', 'image/webp'], 5 * 1024 * 1024),
    ),
  )
  @ApiOperation({ summary: 'Update a resident record' })
  @ApiResponse({ status: 200, description: 'Resident updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  async update(
    @Param('id') id: string,
    @Body() updateResidentDto: UpdateResidentDto,
    @CurrentUser() currentUser: User,
    @UploadedFile() residentPhoto?: Express.Multer.File,
  ) {
    const normalizedUpdateDto = this.normalizeUpdateDto(updateResidentDto);
    const residentPhotoUrl = residentPhoto ? `/uploads/residents/${residentPhoto.filename}` : undefined;
    return this.residentsService.update(
      id,
      residentPhotoUrl ? { ...normalizedUpdateDto, photoUrl: residentPhotoUrl } : normalizedUpdateDto,
      currentUser,
    );
  }

  private normalizeUpdateDto(updateResidentDto: UpdateResidentDto): UpdateResidentDto {
    let normalizedContacts: unknown = updateResidentDto.emergencyContacts;
    if (typeof updateResidentDto.emergencyContacts === 'string') {
      try {
        normalizedContacts = JSON.parse(updateResidentDto.emergencyContacts);
      } catch {
        throw new BadRequestException('Emergency contacts must be valid JSON');
      }
    }

    const normalizedWeight =
      updateResidentDto.weight === undefined ? undefined : Number(updateResidentDto.weight);
    if (normalizedWeight !== undefined && (Number.isNaN(normalizedWeight) || normalizedWeight < 0)) {
      throw new BadRequestException('Weight must be a valid positive number');
    }

    return {
      ...updateResidentDto,
      ...(normalizedWeight !== undefined ? { weight: normalizedWeight } : {}),
      ...(normalizedContacts !== undefined
        ? { emergencyContacts: normalizedContacts as UpdateResidentDto['emergencyContacts'] }
        : {}),
    };
  }

  @Delete(':id')
  @Roles(Role.OWNER, Role.FACILITY_ADMIN, Role.BRANCH_ADMIN)
  @ApiOperation({ summary: 'Delete a resident record' })
  @ApiResponse({ status: 200, description: 'Resident deleted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  async remove(@Param('id') id: string, @CurrentUser() currentUser: User) {
    return this.residentsService.delete(id, currentUser);
  }
}
