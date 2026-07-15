import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { MetricsService } from '../../health/metrics.service';

/**
 * Records every HTTP request's latency into the Prometheus histogram
 * (`flowlogix_http_request_duration_seconds`) exposed at `/health/metrics`.
 *
 * The label is the matched **route pattern** (e.g. `/cards/:id`), never the
 * concrete URL — using raw paths would explode metric cardinality with one
 * series per id. Non-HTTP contexts (websocket/RPC) are skipped.
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const start = process.hrtime.bigint();
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    return next.handle().pipe(
      finalize(() => {
        const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
        this.metrics.observeHttpRequest(
          req.method,
          this.routeOf(req),
          res.statusCode,
          durationSeconds,
        );
      }),
    );
  }

  /** The matched route pattern, falling back to the path if unavailable. */
  private routeOf(req: Request): string {
    const route = (req.route as { path?: string } | undefined)?.path;
    const base = req.baseUrl ?? '';
    if (route) return `${base}${route}` || '/';
    return req.path || 'unknown';
  }
}
