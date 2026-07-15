import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';

/**
 * Structured JSON logging for production APM.
 *
 * Emits one machine-readable JSON object per line to **stdout** — the 12-factor
 * convention, so the container runtime (Docker/Loki/CloudWatch/etc.) owns log
 * collection and rotation. Each line carries a timestamp, level, message, the
 * Nest `context` (the emitting provider), and any structured metadata, plus a
 * static `service`/`env` tag so records from the three API replicas stay
 * attributable once aggregated.
 *
 * In non-production we swap the JSON transport for a colourised, human-readable
 * console so local `npm run start:dev` stays legible.
 */
const isProduction = process.env.NODE_ENV === 'production';

const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }), // serialise Error stacks, don't drop them
  winston.format.json(),
);

const developmentFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, context, stack }) => {
    const ctx = context ? ` [${String(context)}]` : '';
    return `${String(timestamp)} ${level}${ctx} ${stack ?? message}`;
  }),
);

/**
 * A Nest `LoggerService` backed by Winston. Passed to `app.useLogger(...)` in
 * `main.ts` so every framework and application log flows through this pipeline.
 */
export const winstonLogger = WinstonModule.createLogger({
  level: process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),
  defaultMeta: {
    service: 'flowlogix-backend',
    env: process.env.NODE_ENV ?? 'development',
  },
  format: isProduction ? productionFormat : developmentFormat,
  // Log to stdout only; the platform captures the stream.
  transports: [new winston.transports.Console()],
});
