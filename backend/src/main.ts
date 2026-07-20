import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { winstonLogger } from './common/logging/winston.config';
import { HttpMetricsInterceptor } from './common/metrics/http-metrics.interceptor';
import { MetricsService } from './health/metrics.service';

async function bootstrap() {
  // Structured JSON logs to stdout (see winston.config.ts); passed at creation
  // so bootstrap-time logs flow through the same pipeline.
  const app = await NestFactory.create(AppModule, { logger: winstonLogger });

  // Baseline HTTP security headers (CSP left unset so the API does not fight
  // the SPA's own CSP when they share an origin behind the prod nginx edge).
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // Record per-request latency into the Prometheus histogram scraped at
  // /health/metrics (drives the API-latency panels in the Grafana dashboard).
  app.useGlobalInterceptors(
    new HttpMetricsInterceptor(app.get(MetricsService)),
  );

  const configService = app.get(ConfigService);
  const corsOrigin = configService.get<string>(
    'CORS_ORIGIN',
    'http://localhost:5173',
  );
  app.enableCors({
    origin: corsOrigin.split(',').map((origin) => origin.trim()),
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}

bootstrap();
