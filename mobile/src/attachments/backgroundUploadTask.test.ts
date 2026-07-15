import { describe, it, expect, vi } from 'vitest';
import {
  BackgroundRegisterOptions,
  BackgroundTaskHost,
  BackgroundTaskResult,
  DEFAULT_UPLOAD_TASK_NAME,
  DrainableQueue,
  registerBackgroundUploadTask,
  runBackgroundUploadOnce,
  unregisterBackgroundUploadTask,
} from './backgroundUploadTask';
import { ManualNetworkMonitor } from '../sync/networkMonitor';

/** In-memory stand-in for expo-task-manager + expo-background-task. */
class FakeHost implements BackgroundTaskHost {
  readonly executors = new Map<string, () => Promise<BackgroundTaskResult>>();
  readonly registered = new Map<string, BackgroundRegisterOptions>();

  defineTask(
    taskName: string,
    executor: () => Promise<BackgroundTaskResult>,
  ): void {
    this.executors.set(taskName, executor);
  }
  async registerTaskAsync(
    taskName: string,
    options: BackgroundRegisterOptions,
  ): Promise<void> {
    this.registered.set(taskName, options);
  }
  async unregisterTaskAsync(taskName: string): Promise<void> {
    this.registered.delete(taskName);
  }
  async isTaskRegisteredAsync(taskName: string): Promise<boolean> {
    return this.registered.has(taskName);
  }
}

const queueThatDrains = (fn: () => Promise<void>): DrainableQueue => ({
  process: fn,
});

describe('runBackgroundUploadOnce', () => {
  it('no-ops when the connection is not suitable (offline)', async () => {
    const process = vi.fn(async () => {});
    const net = new ManualNetworkMonitor(false, 'none');

    const result = await runBackgroundUploadOnce(
      queueThatDrains(process),
      net,
    );

    expect(result).toBe('no-data');
    expect(process).not.toHaveBeenCalled();
  });

  it('drains the queue on a suitable (wifi) connection', async () => {
    const process = vi.fn(async () => {});
    const net = new ManualNetworkMonitor(true, 'wifi');

    const result = await runBackgroundUploadOnce(
      queueThatDrains(process),
      net,
    );

    expect(result).toBe('new-data');
    expect(process).toHaveBeenCalledOnce();
  });

  it('reports failed (never throws) when the drain rejects', async () => {
    const net = new ManualNetworkMonitor(true, 'cellular');
    const result = await runBackgroundUploadOnce(
      queueThatDrains(async () => {
        throw new Error('disk full');
      }),
      net,
    );
    expect(result).toBe('failed');
  });
});

describe('registerBackgroundUploadTask', () => {
  it('defines and registers the task, wiring the executor to the drain', async () => {
    const host = new FakeHost();
    const process = vi.fn(async () => {});
    const net = new ManualNetworkMonitor(true, 'wifi');

    const name = await registerBackgroundUploadTask({
      host,
      queue: queueThatDrains(process),
      network: net,
    });

    expect(name).toBe(DEFAULT_UPLOAD_TASK_NAME);
    expect(host.registered.has(name)).toBe(true);
    expect(host.registered.get(name)?.startOnBoot).toBe(true);

    // Simulate the OS firing the task -> it should drain the queue.
    const result = await host.executors.get(name)!();
    expect(result).toBe('new-data');
    expect(process).toHaveBeenCalledOnce();
  });

  it('does not double-register an already-registered task', async () => {
    const host = new FakeHost();
    const net = new ManualNetworkMonitor(true, 'wifi');
    const spy = vi.spyOn(host, 'registerTaskAsync');

    await registerBackgroundUploadTask({
      host,
      queue: queueThatDrains(async () => {}),
      network: net,
    });
    await registerBackgroundUploadTask({
      host,
      queue: queueThatDrains(async () => {}),
      network: net,
    });

    expect(spy).toHaveBeenCalledOnce();
  });

  it('unregister removes the OS registration', async () => {
    const host = new FakeHost();
    const net = new ManualNetworkMonitor(true, 'wifi');
    const name = await registerBackgroundUploadTask({
      host,
      queue: queueThatDrains(async () => {}),
      network: net,
    });

    await unregisterBackgroundUploadTask(host, name);
    expect(host.registered.has(name)).toBe(false);
  });
});
