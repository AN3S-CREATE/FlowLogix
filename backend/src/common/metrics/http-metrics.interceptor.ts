import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsService } from '../../health/metrics.service';

/**
 * Records every HTTP request's latency into the Prometheus histogram
 * (`flowlogix_http_request_duration_seconds`) exposed at `/health/metrics`.
 *
 * Two cardinality/accuracy guards:
 *  - the label is the matched **route pattern** (e.g. `/cards/:id`), and requests
 *    that matched no route collapse to a single `unmatched` label — so neither
 *    concrete ids nor a flood of random 404 URLs explode metric cardinality;
 *  - the status is taken from the thrown exception on the error path, because
 *    the exception filter hasn't updated `res.statusCode` yet when we observe.
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const start = process.hrtime.bigint();
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<{ statusCode: number }>();

    // `tap` observes both terminal signals and re-throws errors unchanged.
    return next.handle().pipe(
      tap({
        next: () => this.record(req, res.statusCode, start),
        error: (err) => this.record(req, this.errorStatus(err), start),
      }),
    );
  }

  private record(req: Request, status: number, start: bigint): void {
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
    this.metrics.observeHttpRequest(
      req.method,
      this.routeOf(req),
      status,
      durationSeconds,
    );
  }

  /** HttpException carries its own status; anything else is an unhandled 500. */
  private errorStatus(err: unknown): number {
    return err instanceof HttpException ? err.getStatus() : 500;
  }

  /** The matched route pattern, or a single `unmatched` label (bounds cardinality). */
  private routeOf(req: Request): string {
    const route = (req.route as { path?: string } | undefined)?.path;
    if (!route) return 'unmatched';
    const base = req.baseUrl ?? '';
    return `${base}${route}` || '/';
  }
}
