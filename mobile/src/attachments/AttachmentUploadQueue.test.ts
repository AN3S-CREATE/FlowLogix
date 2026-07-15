import { describe, it, expect, beforeEach } from 'vitest';
import { AttachmentUploadQueue } from './AttachmentUploadQueue';
import { AttachmentUpload, UploadStore } from './ports';
import { ManualNetworkMonitor } from '../sync/networkMonitor';
import { ConnectionType } from '../sync/ports';

/** Flush pending microtasks without relying on real timers (keeps runs hang-free). */
const flush = async (n = 20): Promise<void> => {
  for (let i = 0; i < n; i++) await Promise.resolve();
};

class MemoryUploadStore implements UploadStore {
  readonly rows = new Map<string, AttachmentUpload>();
  async put(record: AttachmentUpload) {
    this.rows.set(record.id, { ...record });
  }
  async get(id: string) {
    return this.rows.get(id) ?? null;
  }
  async listRunnable(now: number) {
    // Contract: only `queued` items past their backoff; `failed` is terminal.
    return [...this.rows.values()]
      .filter((r) => r.status === 'queued' && r.nextAttemptAt <= now)
      .sort((a, b) => a.id.localeCompare(b.id));
  }
  async remove(id: string) {
    this.rows.delete(id);
  }
}

function newFile(id: string): AttachmentUpload {
  return {
    id,
    cardId: 'card-1',
    localUri: `file:///tmp/${id}.bin`,
    filename: `${id}.bin`,
    mimeType: 'application/octet-stream',
    sizeBytes: 10_000_000,
    status: 'queued',
    attempts: 0,
    nextAttemptAt: 0,
  };
}

describe('AttachmentUploadQueue network gating', () => {
  let store: MemoryUploadStore;
  let uploads: string[];
  const uploader = {
    async upload(r: AttachmentUpload) {
      uploads.push(r.id);
      return `https://cdn.example/${r.id}`;
    },
  };

  beforeEach(() => {
    store = new MemoryUploadStore();
    uploads = [];
  });

  const makeQueue = (net: ManualNetworkMonitor) =>
    new AttachmentUploadQueue({
      store,
      uploader,
      network: net,
      maxConcurrent: 5,
      schedule: () => {}, // don't fire real timers in tests
    });

  it('does NOT upload while offline', async () => {
    await store.put(newFile('a'));
    const q = makeQueue(new ManualNetworkMonitor(false, 'none'));
    await q.process();
    expect(uploads).toEqual([]);
    expect(store.rows.get('a')!.status).toBe('queued');
  });

  it.each<ConnectionType>(['wifi', 'cellular', 'ethernet'])(
    'uploads on %s',
    async (type) => {
      await store.put(newFile('a'));
      const q = makeQueue(new ManualNetworkMonitor(true, type));
      await q.process();
      expect(uploads).toEqual(['a']);
      expect(store.rows.get('a')!.status).toBe('uploaded');
      expect(store.rows.get('a')!.remoteUrl).toContain('cdn.example');
    },
  );

  it('drains automatically when the network upgrades to Wi-Fi', async () => {
    await store.put(newFile('a'));
    const net = new ManualNetworkMonitor(false, 'none');
    const q = makeQueue(net);
    q.start();
    expect(uploads).toEqual([]); // still offline

    net.set(true, 'wifi'); // upgrade synchronously fires the subscription
    await flush(); // let the async drain settle (no real timers)
    expect(uploads).toEqual(['a']);
    q.stop();
  });
});

describe('AttachmentUploadQueue concurrency & retry', () => {
  let store: MemoryUploadStore;

  beforeEach(() => {
    store = new MemoryUploadStore();
  });

  it('respects the concurrency limit', async () => {
    for (const id of ['a', 'b', 'c']) await store.put(newFile(id));
    let active = 0;
    let peak = 0;
    // Microtask-based (no real timers): both members of a batch increment
    // `active` before either resolves, so `peak` reflects true concurrency.
    const uploader = {
      async upload(r: AttachmentUpload) {
        active++;
        peak = Math.max(peak, active);
        await Promise.resolve();
        active--;
        return `https://cdn/${r.id}`;
      },
    };
    const q = new AttachmentUploadQueue({
      store,
      uploader,
      network: new ManualNetworkMonitor(true, 'wifi'),
      maxConcurrent: 2,
      schedule: () => {},
    });
    await q.process(); // drains fully — process() awaits every batch
    expect(peak).toBeLessThanOrEqual(2);
    expect(peak).toBe(2); // 3 items, limit 2 -> two ran together
    expect(
      ['a', 'b', 'c'].every((id) => store.rows.get(id)!.status === 'uploaded'),
    ).toBe(true);
  });

  it('backs off and re-queues on failure, then gives up after maxAttempts', async () => {
    await store.put(newFile('a'));
    let now = 1_000_000;
    const uploader = {
      async upload(): Promise<string> {
        throw new Error('network blip');
      },
    };
    const q = new AttachmentUploadQueue({
      store,
      uploader,
      network: new ManualNetworkMonitor(true, 'wifi'),
      maxConcurrent: 1,
      maxAttempts: 3,
      backoffBaseMs: 1000,
      now: () => now,
      schedule: () => {}, // we advance "now" manually instead
    });

    // Attempt 1 -> fails, re-queued with backoff.
    await q.process();
    let row = store.rows.get('a')!;
    expect(row.status).toBe('queued');
    expect(row.attempts).toBe(1);
    expect(row.nextAttemptAt).toBe(now + 1000);
    expect(row.lastError).toBe('network blip');

    // Still backing off -> not runnable yet.
    await q.process();
    expect(store.rows.get('a')!.attempts).toBe(1);

    // Advance past backoff -> attempt 2.
    now = row.nextAttemptAt;
    await q.process();
    expect(store.rows.get('a')!.attempts).toBe(2);

    // Advance -> attempt 3 hits maxAttempts -> permanently failed.
    now = store.rows.get('a')!.nextAttemptAt;
    await q.process();
    row = store.rows.get('a')!;
    expect(row.attempts).toBe(3);
    expect(row.status).toBe('failed');

    // A failed item is terminal: further auto-drains never touch it.
    await q.process();
    expect(store.rows.get('a')!.attempts).toBe(3);
  });

  it('manual retry re-queues a failed item and uploads it', async () => {
    await store.put({
      ...newFile('a'),
      status: 'failed',
      attempts: 6,
      lastError: 'gave up',
    });
    const uploaded: string[] = [];
    const q = new AttachmentUploadQueue({
      store,
      uploader: {
        async upload(r) {
          uploaded.push(r.id);
          return `https://cdn/${r.id}`;
        },
      },
      network: new ManualNetworkMonitor(true, 'wifi'),
      schedule: () => {},
    });

    await q.retry('a');
    await flush();
    const row = store.rows.get('a')!;
    expect(uploaded).toEqual(['a']);
    expect(row.status).toBe('uploaded');
    expect(row.attempts).toBe(0);
  });
});
