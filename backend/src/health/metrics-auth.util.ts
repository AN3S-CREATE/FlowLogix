import { timingSafeEqual } from 'crypto';
import { Request } from 'express';

/**
 * Protects `GET /health/metrics` when `METRICS_SECRET` is set (or always in
 * production). Accepts either `Authorization: Bearer <secret>` or
 * `X-Metrics-Secret: <secret>`. `/health` stays public for load balancers.
 *
 * Dev (non-production) with no secret: open scrape (local Prometheus / curl).
 * Production with no secret: deny (fail closed — set METRICS_SECRET).
 */
export function isMetricsRequestAuthorized(req: Request): boolean {
  const secret = process.env.METRICS_SECRET?.trim() ?? '';
  if (!secret) {
    return process.env.NODE_ENV !== 'production';
  }

  const fromHeader = headerValue(req.headers['x-metrics-secret']);
  if (fromHeader !== null && secretsEqual(fromHeader, secret)) {
    return true;
  }

  const auth = headerValue(req.headers.authorization);
  if (auth !== null && auth.toLowerCase().startsWith('bearer ')) {
    const token = auth.slice('bearer '.length).trim();
    return secretsEqual(token, secret);
  }

  return false;
}

function headerValue(raw: string | string[] | undefined): string | null {
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0];
  return null;
}

function secretsEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) {
    // Constant-time-ish reject: compare against itself so timing doesn't leak length.
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}
