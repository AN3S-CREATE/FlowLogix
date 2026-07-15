import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  it('renders dependency, latency, redis and websocket gauges', async () => {
    const metrics = new MetricsService();
    metrics.recordProbe({ name: 'postgres', status: 'up', latencyMs: 5 });
    metrics.recordProbe({
      name: 'redis',
      status: 'up',
      latencyMs: 2,
      details: { usedMemoryBytes: 1048576, connectedClients: 3 },
    });
    metrics.setWebsocketPoolSize(7);
    metrics.setActiveBoardUsers(4);

    const text = await metrics.metrics();

    expect(text).toMatch(
      /flowlogix_dependency_up\{[^}]*dependency="postgres"[^}]*\} 1/,
    );
    expect(text).toMatch(/flowlogix_postgres_latency_ms[^\n]* 5/);
    expect(text).toMatch(/flowlogix_redis_used_memory_bytes[^\n]* 1048576/);
    expect(text).toMatch(/flowlogix_redis_connected_clients[^\n]* 3/);
    expect(text).toMatch(/flowlogix_websocket_pool_size[^\n]* 7/);
    expect(text).toMatch(/flowlogix_active_board_users[^\n]* 4/);
  });

  it('records a down dependency as 0', async () => {
    const metrics = new MetricsService();
    metrics.recordProbe({
      name: 'mongo',
      status: 'down',
      latencyMs: 100,
      details: { error: 'unreachable' },
    });
    const text = await metrics.metrics();
    expect(text).toMatch(
      /flowlogix_dependency_up\{[^}]*dependency="mongo"[^}]*\} 0/,
    );
  });

  it('advertises the prometheus content type', () => {
    expect(new MetricsService().contentType()).toContain('text/plain');
  });
});
