import { HealthService } from './health.service';
import { MetricsService } from './metrics.service';
import { HealthProbe, ProbeResult } from './health.types';

const probe = (result: ProbeResult): HealthProbe => ({
  check: jest.fn().mockResolvedValue(result),
});

const up = (name: string): ProbeResult => ({
  name,
  status: 'up',
  latencyMs: 1,
});
const down = (name: string): ProbeResult => ({
  name,
  status: 'down',
  latencyMs: 1,
  details: { error: 'x' },
});

function make(pg: ProbeResult, redis: ProbeResult, mongo: ProbeResult) {
  const metrics = { recordProbe: jest.fn() } as unknown as MetricsService;
  const service = new HealthService(
    probe(pg) as never,
    probe(redis) as never,
    probe(mongo) as never,
    metrics,
  );
  return { service, metrics };
}

describe('HealthService', () => {
  it('reports ok and records every probe when all dependencies are up', async () => {
    const { service, metrics } = make(up('postgres'), up('redis'), up('mongo'));
    const report = await service.check();

    expect(report.status).toBe('ok');
    expect(report.checks).toHaveLength(3);
    expect(metrics.recordProbe).toHaveBeenCalledTimes(3);
    expect(report.timestamp).toEqual(expect.any(String));
  });

  it('reports degraded when any dependency is down', async () => {
    const { service } = make(up('postgres'), down('redis'), up('mongo'));
    const report = await service.check();

    expect(report.status).toBe('degraded');
    expect(report.checks.find((c) => c.name === 'redis')?.status).toBe('down');
  });

  it('stays ok when mongo is down but HEALTH_REQUIRE_MONGO=false', async () => {
    const prev = process.env.HEALTH_REQUIRE_MONGO;
    process.env.HEALTH_REQUIRE_MONGO = 'false';
    try {
      const { service, metrics } = make(
        up('postgres'),
        up('redis'),
        down('mongo'),
      );
      const report = await service.check();

      expect(report.status).toBe('ok');
      expect(report.checks.find((c) => c.name === 'mongo')?.status).toBe(
        'down',
      );
      expect(metrics.recordProbe).toHaveBeenCalledTimes(3);
    } finally {
      if (prev === undefined) delete process.env.HEALTH_REQUIRE_MONGO;
      else process.env.HEALTH_REQUIRE_MONGO = prev;
    }
  });

  it('degrades when mongo is down and HEALTH_REQUIRE_MONGO is unset', async () => {
    const prev = process.env.HEALTH_REQUIRE_MONGO;
    delete process.env.HEALTH_REQUIRE_MONGO;
    try {
      const { service } = make(up('postgres'), up('redis'), down('mongo'));
      const report = await service.check();
      expect(report.status).toBe('degraded');
    } finally {
      if (prev === undefined) delete process.env.HEALTH_REQUIRE_MONGO;
      else process.env.HEALTH_REQUIRE_MONGO = prev;
    }
  });
});
