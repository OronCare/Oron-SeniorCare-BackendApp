import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetPasswordDto {
  @ApiProperty({ description: 'One-time token from email link' })
  @IsString()
  token!: string;

  @ApiProperty({ description: 'New password' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ description: 'Confirm new password' })
  @IsString()
  @MinLength(8)
  confirmPassword!: string;
}

