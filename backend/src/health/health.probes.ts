import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { createClient, RedisClientType } from 'redis';
import { MongoClient } from 'mongodb';
import { HealthProbe, ProbeResult } from './health.types';

const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

/** Postgres: response latency of a `SELECT 1` round trip. */
@Injectable()
export class PostgresProbe implements HealthProbe {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async check(): Promise<ProbeResult> {
    const start = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      return { name: 'postgres', status: 'up', latencyMs: Date.now() - start };
    } catch (e) {
      return {
        name: 'postgres',
        status: 'down',
        latencyMs: Date.now() - start,
        details: { error: errorMessage(e) },
      };
    }
  }
}

const numericInfoField = (info: string, field: string): number | undefined => {
  const match = new RegExp(`^${field}:(.*)$`, 'm').exec(info);
  return match ? Number(match[1].trim()) : undefined;
};

/** Redis: memory load and connection metrics from `INFO`. */
@Injectable()
export class RedisProbe implements HealthProbe, OnModuleDestroy {
  // Cache the connection *promise*, not the resolved client, so concurrent
  // `check()` calls share a single connect() instead of each opening (and
  // leaking) their own socket.
  private clientPromise: Promise<RedisClientType> | null = null;

  private getClient(): Promise<RedisClientType> {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const client: RedisClientType = createClient({
          // Authenticate when the production Redis enforces `requirepass`.
          password: process.env.REDIS_PASSWORD || undefined,
          socket: {
            host: process.env.REDIS_HOST ?? 'localhost',
            port: Number(process.env.REDIS_PORT ?? 6379),
            reconnectStrategy: false,
          },
        });
        // Swallow async errors; `check()` reports connectivity via its result.
        client.on('error', () => undefined);
        await client.connect();
        return client;
      })();
    }
    return this.clientPromise;
  }

  async check(): Promise<ProbeResult> {
    const start = Date.now();
    try {
      const client = await this.getClient();
      const info = await client.info();
      return {
        name: 'redis',
        status: 'up',
        latencyMs: Date.now() - start,
        details: {
          usedMemoryBytes: numericInfoField(info, 'used_memory') ?? null,
          usedMemoryHuman:
            /^used_memory_human:(.*)$/m.exec(info)?.[1]?.trim() ?? null,
          connectedClients: numericInfoField(info, 'connected_clients') ?? null,
        },
      };
    } catch (e) {
      await this.reset();
      return {
        name: 'redis',
        status: 'down',
        latencyMs: Date.now() - start,
        details: { error: errorMessage(e) },
      };
    }
  }

  private async reset(): Promise<void> {
    const promise = this.clientPromise;
    this.clientPromise = null;
    if (!promise) return;
    try {
      const client = await promise;
      await client.quit();
    } catch {
      // ignore — the connection failed or we're discarding it anyway
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.reset();
  }
}

/** MongoDB: connection health and active replica-set status via `hello`. */
@Injectable()
export class MongoProbe implements HealthProbe, OnModuleDestroy {
  // Cache the connection *promise* (see RedisProbe) so concurrent `check()`
  // calls share one connect() rather than each leaking a MongoClient.
  private clientPromise: Promise<MongoClient> | null = null;

  private getClient(): Promise<MongoClient> {
    if (!this.clientPromise) {
      const client = new MongoClient(
        process.env.MONGO_URI ?? 'mongodb://localhost:27017',
        { serverSelectionTimeoutMS: 2000 },
      );
      this.clientPromise = client.connect();
    }
    return this.clientPromise;
  }

  async check(): Promise<ProbeResult> {
    const start = Date.now();
    try {
      const client = await this.getClient();
      const hello = await client.db('admin').command({ hello: 1 });
      return {
        name: 'mongo',
        status: 'up',
        latencyMs: Date.now() - start,
        details: {
          topology: hello.setName ? 'replicaSet' : 'standalone',
          replicaSet: hello.setName ?? null,
          isWritablePrimary: hello.isWritablePrimary === true,
          hosts: hello.hosts ?? [],
        },
      };
    } catch (e) {
      await this.reset();
      return {
        name: 'mongo',
        status: 'down',
        latencyMs: Date.now() - start,
        details: { error: errorMessage(e) },
      };
    }
  }

  private async reset(): Promise<void> {
    const promise = this.clientPromise;
    this.clientPromise = null;
    if (!promise) return;
    try {
      const client = await promise;
      await client.close();
    } catch {
      // ignore — the connection failed or we're discarding it anyway
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.reset();
  }
}
