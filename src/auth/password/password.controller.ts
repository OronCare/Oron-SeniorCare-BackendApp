import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../decorators/public.decorator';
import { SetPasswordDto } from './dto/set-password.dto';
import { UsersService } from '../../users/users.service';

@ApiTags('Password')
@Controller('auth/password')
export class PasswordController {
  constructor(
    private readonly usersService: UsersService,
  ) {}

  @Public()
  @Post('set')
  @ApiOperation({ summary: 'Set password using emailed one-time token' })
  @ApiResponse({ status: 200, description: 'Password set successfully' })
  @ApiResponse({ status: 400, description: 'Invalid token or validation error' })
  async setPassword(@Body() dto: SetPasswordDto) {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const user = await this.usersService.consumeSetPasswordToken(dto.token);
    await this.usersService.update(user.id, { password: dto.password } as any);
    return { message: 'Password set successfully' };
  }
}

