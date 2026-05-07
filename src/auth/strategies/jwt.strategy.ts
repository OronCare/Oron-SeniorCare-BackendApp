// auth/jwt.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly usersService: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET || 'SECRET_KEY',
    });
  }

  async validate(payload: any) {
    const id = payload.id ?? payload.sub;
    if (!id) {
      return payload;
    }

    const user = await this.usersService.findById(id);
    if (!user) {
      return { ...payload, id };
    }

    // Attach full user identity (no password removal needed; UsersService.findById returns model with password,
    // but we never expose request.user directly to clients)
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      middleName: user.middleName ?? undefined,
      lastName: user.lastName,
      role: user.role,
      facilityId: user.facilityId ?? undefined,
      branchId: user.branchId ?? undefined,
    };
  }
}