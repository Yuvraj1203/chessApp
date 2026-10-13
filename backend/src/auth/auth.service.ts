import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';

import type { AuthUser } from '../common/auth.types';
import { DB, type Database } from '../database/database.module';
import { users } from '../database/schema';

export const AUTH_COOKIE = 'koc_token';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email.trim().toLowerCase()));
    // Same error for unknown email and wrong password: no account enumeration.
    const ok = row ? await bcrypt.compare(password, row.passwordHash) : false;
    if (!row || !ok)
      throw new UnauthorizedException('Invalid email or password');

    const user: AuthUser = {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
    };
    const token = await this.jwt.signAsync({ sub: row.id, role: row.role });
    return { user, token };
  }

  /** Verifies a JWT and loads the (still existing) user, or returns null. */
  async userFromToken(token: string | undefined): Promise<AuthUser | null> {
    if (!token) return null;
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token);
      const [row] = await this.db
        .select()
        .from(users)
        .where(eq(users.id, payload.sub));
      if (!row) return null;
      return { id: row.id, email: row.email, name: row.name, role: row.role };
    } catch {
      return null;
    }
  }
}

/** Minimal Cookie header parser (used by the Socket.IO handshake). */
export function readCookie(header: string | undefined, name: string) {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0 && part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return undefined;
}
