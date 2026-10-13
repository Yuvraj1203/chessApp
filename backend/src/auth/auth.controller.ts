import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';

import type { AuthUser } from '../common/auth.types';
import { CurrentUser, Public } from '../common/decorators';
import { MatchesService } from '../matches/matches.service';
import { AUTH_COOKIE, AuthService } from './auth.service';
import { LoginDto } from './dto';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
    private readonly matches: MatchesService,
  ) {}

  private cookieOptions() {
    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: this.config.get('NODE_ENV') === 'production',
      path: '/',
    };
  }

  @Public()
  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, token } = await this.auth.login(dto.email, dto.password);
    res.cookie(AUTH_COOKIE, token, {
      ...this.cookieOptions(),
      maxAge: WEEK_MS,
    });
    return { user };
  }

  @Public()
  @Post('auth/logout')
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(AUTH_COOKIE, this.cookieOptions());
    return { loggedOut: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return { user, activeMatchId: this.matches.activeMatchIdFor(user.id) };
  }
}
