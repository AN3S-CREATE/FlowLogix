import { Request } from 'express';
import { isMetricsRequestAuthorized } from './metrics-auth.util';

function req(headers: Record<string, string | string[] | undefined>): Request {
  return { headers } as Request;
}

describe('isMetricsRequestAuthorized', () => {
  const prevSecret = process.env.METRICS_SECRET;
  const prevNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (prevSecret === undefined) delete process.env.METRICS_SECRET;
    else process.env.METRICS_SECRET = prevSecret;
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
  });

  it('allows scrape in non-production when METRICS_SECRET is unset', () => {
    delete process.env.METRICS_SECRET;
    process.env.NODE_ENV = 'development';
    expect(isMetricsRequestAuthorized(req({}))).toBe(true);
  });

  it('denies scrape in production when METRICS_SECRET is unset', () => {
    delete process.env.METRICS_SECRET;
    process.env.NODE_ENV = 'production';
    expect(isMetricsRequestAuthorized(req({}))).toBe(false);
  });

  it('requires matching X-Metrics-Secret when secret is set', () => {
    process.env.METRICS_SECRET = 's3cret';
    process.env.NODE_ENV = 'development';
    expect(isMetricsRequestAuthorized(req({}))).toBe(false);
    expect(
      isMetricsRequestAuthorized(req({ 'x-metrics-secret': 'wrong' })),
    ).toBe(false);
    expect(
      isMetricsRequestAuthorized(req({ 'x-metrics-secret': 's3cret' })),
    ).toBe(true);
  });

  it('accepts Authorization Bearer token matching the secret', () => {
    process.env.METRICS_SECRET = 's3cret';
    expect(
      isMetricsRequestAuthorized(req({ authorization: 'Bearer s3cret' })),
    ).toBe(true);
    expect(
      isMetricsRequestAuthorized(req({ authorization: 'Bearer nope' })),
    ).toBe(false);
  });
});
