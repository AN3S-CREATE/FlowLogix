import { Injectable } from '@nestjs/common';
import { collectDefaultMetrics, Gauge, Histogram, Registry } from 'prom-client';
import { ProbeResult } from './health.types';

/**
 * Prometheus metrics registry for the diagnostics workspace. Holds the gauges
 * exported at `GET /health/metrics`:
 *   - per-dependency up/down + Postgres latency,
 *   - Redis memory load and connected clients,
 *   - total active board users and the websocket pool size (pushed by the
 *     realtime gateway on connect/join lifecycle).
 *
 * A private `Registry` (not the global default) keeps the output scoped to this
 * app and makes the service trivially unit-testable.
 */
@Injectable()
export class MetricsService {
  private readonly registry = new Registry();

  private readonly dependencyUp = new Gauge({
    name: 'flowlogix_dependency_up',
    help: '1 if the backing store is reachable, else 0',
    labelNames: ['dependency'],
    registers: [this.registry],
  });
  private readonly pgLatency = new Gauge({
    name: 'flowlogix_postgres_latency_ms',
    help: 'Latency of the Postgres SELECT 1 health probe (ms)',
    registers: [this.registry],
  });
  private readonly redisMemory = new Gauge({
    name: 'flowlogix_redis_used_memory_bytes',
    help: 'Redis used memory in bytes',
    registers: [this.registry],
  });
  private readonly redisClients = new Gauge({
    name: 'flowlogix_redis_connected_clients',
    help: 'Number of client connections to Redis',
    registers: [this.registry],
  });
  private readonly activeBoardUsers = new Gauge({
    name: 'flowlogix_active_board_users',
    help: 'Distinct users currently connected to a board room',
    registers: [this.registry],
  });
  private readonly websocketPoolSize = new Gauge({
    name: 'flowlogix_websocket_pool_size',
    help: 'Number of open realtime websocket connections',
    registers: [this.registry],
  });
  private readonly httpDuration = new Histogram({
    name: 'flowlogix_http_request_duration_seconds',
    help: 'HTTP request latency in seconds, by method/route/status',
    labelNames: ['method', 'route', 'status'],
    // Buckets tuned for a web API: sub-10ms up to slow 5s outliers.
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [this.registry],
  });

  constructor() {
    this.registry.setDefaultLabels({ app: 'flowlogix-backend' });
    // Node process CPU + memory + event-loop metrics (process_cpu_seconds_total,
    // process_resident_memory_bytes, nodejs_heap_size_used_bytes, ...) so the
    // Grafana dashboard can show per-instance memory/CPU without a node_exporter.
    collectDefaultMetrics({ register: this.registry, prefix: 'flowlogix_' });
  }

  /** Observe one completed HTTP request's latency (seconds). */
  observeHttpRequest(
    method: string,
    route: string,
    status: number,
    durationSeconds: number,
  ): void {
    this.httpDuration.observe(
      { method, route, status: String(status) },
      durationSeconds,
    );
  }

  /** Fold a probe result into the dependency + latency/memory gauges. */
  recordProbe(result: ProbeResult): void {
    this.dependencyUp.set(
      { dependency: result.name },
      result.status === 'up' ? 1 : 0,
    );
    if (result.name === 'postgres') {
      this.pgLatency.set(result.latencyMs);
    }
    if (result.name === 'redis' && result.details) {
      const memory = Number(result.details.usedMemoryBytes);
      const clients = Number(result.details.connectedClients);
      if (Number.isFinite(memory)) this.redisMemory.set(memory);
      if (Number.isFinite(clients)) this.redisClients.set(clients);
    }
  }

  /** Pushed by the realtime gateway as sockets connect/disconnect. */
  setWebsocketPoolSize(size: number): void {
    this.websocketPoolSize.set(size);
  }

  /** Pushed by the realtime gateway as users join/leave board rooms. */
  setActiveBoardUsers(count: number): void {
    this.activeBoardUsers.set(count);
  }

  /** The Prometheus exposition text for `GET /health/metrics`. */
  metrics(): Promise<string> {
    return this.registry.metrics();
  }

  contentType(): string {
    return this.registry.contentType;
  }
}
