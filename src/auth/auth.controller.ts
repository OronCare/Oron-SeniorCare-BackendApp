// auth/auth.controller.ts
import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { OwnerLoginDto } from './dto/owner-login.dto';
import { Public } from './decorators/public.decorator';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Login for all users (Facility Admin, Branch Admin, Staff)' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto.email, loginDto.password);
  }

  @Public()
  @Post('owner/login')
  @ApiOperation({ summary: 'Login for Owner only' })
  @ApiResponse({ status: 200, description: 'Owner login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async loginOwner(@Body() ownerLoginDto: OwnerLoginDto) {
    return this.authService.login(ownerLoginDto.email, ownerLoginDto.password);
  }
}