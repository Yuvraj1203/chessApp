import { Controller, Get, Inject } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';

import { Roles } from '../common/decorators';
import { DB, type Database } from '../database/database.module';
import { users } from '../database/schema';

@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Coach-only: list students (used to add participants). */
  @Roles('coach')
  @Get('students')
  students() {
    return this.db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.role, 'student'))
      .orderBy(asc(users.name));
  }
}
