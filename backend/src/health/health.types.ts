/** One dependency's health, as returned by a probe and surfaced at `/health`. */
export interface ProbeResult {
  /** Dependency name: 'postgres' | 'redis' | 'mongo'. */
  name: string;
  status: 'up' | 'down';
  /** Round-trip latency of the probe query, in milliseconds. */
  latencyMs: number;
  /** Probe-specific detail (memory, replica status, error message, …). */
  details?: Record<string, unknown>;
}

/** A probe checks one backing store and reports its health. */
export interface HealthProbe {
  check(): Promise<ProbeResult>;
}

export interface HealthReport {
  status: 'ok' | 'degraded';
  timestamp: string;
  checks: ProbeResult[];
}
