import {
  CallHandler,
  ExecutionContext,
  NotFoundException,
} from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';
import { MetricsService } from '../../health/metrics.service';

function httpContext(
  req: Record<string, unknown>,
  res: Record<string, unknown>,
): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext;
}

function setup() {
  const observe = jest.fn();
  const metrics = { observeHttpRequest: observe } as unknown as MetricsService;
  return { interceptor: new HttpMetricsInterceptor(metrics), observe };
}

describe('HttpMetricsInterceptor', () => {
  it('records the matched route pattern and success status', async () => {
    const { interceptor, observe } = setup();
    const ctx = httpContext(
      { method: 'GET', route: { path: '/cards/:id' }, baseUrl: '' },
      { statusCode: 200 },
    );
    const next: CallHandler = { handle: () => of('ok') };

    await lastValueFrom(interceptor.intercept(ctx, next));

    expect(observe).toHaveBeenCalledWith(
      'GET',
      '/cards/:id',
      200,
      expect.any(Number),
    );
  });

  it('labels the status from the thrown exception (not the stale res.statusCode)', async () => {
    const { interceptor, observe } = setup();
    const ctx = httpContext(
      { method: 'GET', route: { path: '/cards/:id' }, baseUrl: '' },
      { statusCode: 200 }, // exception filter hasn't run yet
    );
    const next: CallHandler = {
      handle: () => throwError(() => new NotFoundException()),
    };

    await expect(
      lastValueFrom(interceptor.intercept(ctx, next)),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(observe).toHaveBeenCalledWith(
      'GET',
      '/cards/:id',
      404,
      expect.any(Number),
    );
  });

  it('collapses an unmatched route to a single label (cardinality guard)', async () => {
    const { interceptor, observe } = setup();
    const ctx = httpContext(
      { method: 'GET', route: undefined, baseUrl: '', path: '/random/9271' },
      { statusCode: 404 },
    );
    const next: CallHandler = { handle: () => of('x') };

    await lastValueFrom(interceptor.intercept(ctx, next));

    expect(observe).toHaveBeenCalledWith(
      'GET',
      'unmatched',
      404,
      expect.any(Number),
    );
  });
});
