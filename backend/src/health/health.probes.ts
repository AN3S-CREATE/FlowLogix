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
  private client: RedisClientType | null = null;

  private async getClient(): Promise<RedisClientType> {
    if (!this.client) {
      const client: RedisClientType = createClient({
        socket: {
          host: process.env.REDIS_HOST ?? 'localhost',
          port: Number(process.env.REDIS_PORT ?? 6379),
          reconnectStrategy: false,
        },
      });
      // Swallow async errors; `check()` reports connectivity via its result.
      client.on('error', () => undefined);
      await client.connect();
      this.client = client;
    }
    return this.client;
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
    try {
      await this.client?.quit();
    } catch {
      // ignore — we're discarding the client anyway
    }
    this.client = null;
  }

  async onModuleDestroy(): Promise<void> {
    await this.reset();
  }
}

/** MongoDB: connection health and active replica-set status via `hello`. */
@Injectable()
export class MongoProbe implements HealthProbe, OnModuleDestroy {
  private client: MongoClient | null = null;

  private async getClient(): Promise<MongoClient> {
    if (!this.client) {
      const client = new MongoClient(
        process.env.MONGO_URI ?? 'mongodb://localhost:27017',
        { serverSelectionTimeoutMS: 2000 },
      );
      await client.connect();
      this.client = client;
    }
    return this.client;
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
    try {
      await this.client?.close();
    } catch {
      // ignore
    }
    this.client = null;
  }

  async onModuleDestroy(): Promise<void> {
    await this.reset();
  }
}
