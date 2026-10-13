import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

export const DB = Symbol('DB');
const CLIENT = Symbol('PG_CLIENT');

export type Database = PostgresJsDatabase<typeof schema>;

@Global()
@Module({
  providers: [
    {
      provide: CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        // prepare:false => compatible with Supabase's transaction-mode pooler.
        postgres(config.getOrThrow<string>('DATABASE_URL'), {
          prepare: false,
        }),
    },
    {
      provide: DB,
      inject: [CLIENT],
      useFactory: (client: postgres.Sql): Database =>
        drizzle(client, { schema }),
    },
  ],
  exports: [DB],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(CLIENT) private readonly client: postgres.Sql) {}

  async onApplicationShutdown(): Promise<void> {
    await this.client.end();
  }
}
