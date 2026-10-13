import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import type { AuthUser } from '../common/auth.types';
import { IS_PUBLIC, ROLES_KEY } from '../common/decorators';
import type { Role } from '../database/schema';
import { AUTH_COOKIE, AuthService } from './auth.service';

/** Global guard: every route needs a valid JWT cookie unless @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
        ctx.getHandler(),
        ctx.getClass(),
      ])
    ) {
      return true;
    }
    const req = ctx
      .switchToHttp()
      .getRequest<
        Request & { user?: AuthUser; cookies?: Record<string, string> }
      >();
    const user = await this.auth.userFromToken(req.cookies?.[AUTH_COOKIE]);
    if (!user) throw new UnauthorizedException('Please log in');
    req.user = user;
    return true;
  }
}

/** Global guard: enforces @Roles(...) after authentication. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!roles?.length) return true;
    const { user } = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (!user || !roles.includes(user.role)) {
      throw new ForbiddenException('You do not have access to this resource');
    }
    return true;
  }
}
