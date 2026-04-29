import { IsEmail, IsString, MinLength, IsOptional, IsUUID, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../../common/enums/role.enum';

export class CreateUserDto {
  @ApiProperty({ example: 'John', description: 'User first name' })
  @IsString()
  firstName: string;

  @ApiPropertyOptional({ example: 'Middle', description: 'User middle name' })
  @IsOptional()
  @IsString()
  middleName?: string;

  @ApiProperty({ example: 'Doe', description: 'User last name' })
  @IsString()
  lastName: string;

  @ApiProperty({ example: 'john.doe@oron.com', description: 'User email address' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123', description: 'User password' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ enum: Role, example: Role.STAFF, description: 'User role' })
  @IsEnum(Role)
  role: Role;

  @ApiPropertyOptional({ example: 'uuid-facility-id', description: 'Facility ID (required for facility admin and below)' })
  @IsOptional()
  @IsUUID()
  facilityId?: string;

  @ApiPropertyOptional({ example: 'uuid-branch-id', description: 'Branch ID (required for branch admin and staff)' })
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'John', description: 'User first name' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ example: 'Middle', description: 'User middle name' })
  @IsOptional()
  @IsString()
  middleName?: string;

  @ApiPropertyOptional({ example: 'Doe', description: 'User last name' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ example: 'john.doe@oron.com', description: 'User email address' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ enum: Role, example: Role.STAFF, description: 'User role' })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({ example: 'uuid-facility-id', description: 'Facility ID' })
  @IsOptional()
  @IsUUID()
  facilityId?: string;

  @ApiPropertyOptional({ example: 'uuid-branch-id', description: 'Branch ID' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({ example: 'password123', description: 'New password' })
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}