import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateBranchDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsString()
  @IsNotEmpty()
  status: string;

  @IsInt()
  @Min(1)
  residentLimit: number;

  @IsOptional()
  @IsUUID()
  branchAdminId?: string;

  @IsOptional()
  @IsString()
  branchAdminName?: string;
}
