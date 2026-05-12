// auth/auth.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategies';
import { UsersModule } from '../users/users.module';
import { RolesGuard } from './guards/roles.guard';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { PasswordController } from './password/password.controller';

@Module({
  imports: [
    UsersModule,
    AuditLogsModule,
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'SECRET_KEY',
      signOptions: { expiresIn: '1d' },
    }),
  ],
  controllers: [AuthController, PasswordController],
  providers: [AuthService, JwtStrategy, LocalStrategy, RolesGuard],
  exports: [AuthService, RolesGuard],
})
export class AuthModule {}