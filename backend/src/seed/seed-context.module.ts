import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { SeedModule } from './seed.module';

/**
 * Minimal application context for the `seed` CLI: config + the Postgres
 * DataSource + the SeedService, and nothing else. Deliberately does NOT boot
 * the full AppModule, so seeding the database doesn't require Redis, Mongo, or
 * the websocket gateway to be running.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    SeedModule,
  ],
})
export class SeedContextModule {}
