import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SeedContextModule } from './seed/seed-context.module';
import { SeedService } from './seed/seed.service';

/**
 * CLI entrypoint for the development database seed. Run `npm run seed` (after a
 * build) — it boots the minimal Postgres-only context, populates the Veralogix
 * workspace, and exits. Idempotent, so it's safe to re-run.
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('Seed');
  const app = await NestFactory.createApplicationContext(SeedContextModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const summary = await app.get(SeedService).seed();
    logger.log(`Seed complete: ${JSON.stringify(summary)}`);
  } catch (error) {
    logger.error('Seed failed', error as Error);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void bootstrap();
