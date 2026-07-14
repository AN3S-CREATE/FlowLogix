import { NetworkMonitor } from '../sync/ports';
import { isSuitableForLargeUpload } from '../sync/networkMonitor';
import {
  AttachmentUpload,
  AttachmentUploader,
  NewAttachmentUpload,
  UploadStore,
} from './ports';

export interface AttachmentQueueConfig {
  store: UploadStore;
  uploader: AttachmentUploader;
  network: NetworkMonitor;
  /** Max simultaneous uploads. Default 2. */
  maxConcurrent?: number;
  /** Give up (mark permanently failed) after this many attempts. Default 6. */
  maxAttempts?: number;
  /** Base backoff in ms; grows exponentially per attempt. Default 2000. */
  backoffBaseMs?: number;
  /** Cap on a single backoff delay. Default 5 min. */
  backoffMaxMs?: number;
  /** Injectable clock/timer for tests. */
  now?: () => number;
  schedule?: (fn: () => void, ms: number) => void;
}

type ResolvedConfig = Required<AttachmentQueueConfig>;

/**
 * Background upload queue for large attachments.
 *
 * Files are staged in local storage the moment the user attaches them (fully
 * offline), and the actual transfer is deferred until the device is on a
 * connection worth spending bytes on — **Wi-Fi or cellular/LTE**, never while
 * offline (see `isSuitableForLargeUpload`). The queue survives restarts because
 * every item is persisted; on a network upgrade it drains automatically.
 *
 * Concurrency is a **dynamic worker pool** of `maxConcurrent` workers: each
 * grabs the next runnable item as soon as it finishes the last one, so a single
 * slow upload never blocks the others (no batch barrier). Failures back off
 * exponentially; after `maxAttempts` an item is parked as terminal `failed`
 * (only a manual `retry` re-queues it, so a poison item can't spin the pool).
 */
export class AttachmentUploadQueue {
  private readonly cfg: ResolvedConfig;
  private readonly inFlight = new Set<string>();
  /** Pending backoff timers, cleared on `stop()` so nothing runs after teardown. */
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private unsubscribe: (() => void) | null = null;
  private stopped = false;
  /** Re-entrancy guard so only one drain runs at a time. */
  private draining = false;
  /** Set when `process` is called mid-drain, so the drain takes another pass. */
  private rerun = false;

  constructor(config: AttachmentQueueConfig) {
    const defaultSchedule = (fn: () => void, ms: number): void => {
      const id = setTimeout(() => {
        this.timers.delete(id);
        fn();
      }, ms);
      this.timers.add(id);
    };
    this.cfg = {
      maxConcurrent: 2,
      maxAttempts: 6,
      backoffBaseMs: 2000,
      backoffMaxMs: 5 * 60 * 1000,
      now: () => Date.now(),
      schedule: config.schedule ?? defaultSchedule,
      ...config,
    };
  }

  /** Start draining automatically whenever the network becomes suitable. */
  start(): void {
    if (this.unsubscribe) return;
    this.stopped = false;
    this.unsubscribe = this.cfg.network.subscribe(() => this.kick());
    this.kick();
  }

  /** Tear down: stop listening and cancel any pending backoff timers. */
  stop(): void {
    this.stopped = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    for (const id of this.timers) clearTimeout(id);
    this.timers.clear();
  }

  /** Stage a file for upload. Returns immediately; the transfer is deferred. */
  async enqueue(input: NewAttachmentUpload): Promise<AttachmentUpload> {
    const record: AttachmentUpload = {
      ...input,
      status: 'queued',
      attempts: 0,
      nextAttemptAt: 0,
    };
    await this.cfg.store.put(record);
    this.kick();
    return record;
  }

  /**
   * Manually re-queue a permanently-`failed` item (e.g. from a "retry" button),
   * resetting its backoff and attempt counter, then kick a drain.
   */
  async retry(id: string): Promise<void> {
    const record = await this.cfg.store.get(id);
    if (!record || record.status !== 'failed') return;
    await this.cfg.store.put({
      ...record,
      status: 'queued',
      attempts: 0,
      nextAttemptAt: 0,
      lastError: undefined,
    });
    this.kick();
  }

  /** Fire-and-forget drain that can't become an unhandled rejection. */
  private kick(): void {
    this.process().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Attachment upload drain failed', err);
    });
  }

  /**
   * Drain the queue with a worker pool while the network stays suitable. A
   * single drain runs at a time (`draining` guard); calls that arrive mid-drain
   * flip `rerun` so it takes another pass and picks up newly-enqueued work.
   */
  async process(): Promise<void> {
    if (this.draining) {
      this.rerun = true;
      return;
    }
    this.draining = true;
    try {
      this.rerun = true;
      while (this.rerun) {
        this.rerun = false;
        await this.drainOnce();
      }
    } finally {
      this.draining = false;
    }
  }

  /** Run up to `maxConcurrent` workers; each pulls the next item until dry. */
  private async drainOnce(): Promise<void> {
    const workerCount = Math.max(1, this.cfg.maxConcurrent);
    await Promise.all(
      Array.from({ length: workerCount }, () => this.worker()),
    );
  }

  private async worker(): Promise<void> {
    for (;;) {
      if (this.stopped || !isSuitableForLargeUpload(this.cfg.network)) return;
      const runnable = await this.cfg.store.listRunnable(this.cfg.now());
      // Only auto-run queued items; `failed` is terminal. Claim synchronously
      // (no await between the find and the `inFlight.add`) so two workers can't
      // grab the same item.
      const next = runnable.find(
        (r) => r.status === 'queued' && !this.inFlight.has(r.id),
      );
      if (!next) return;
      this.inFlight.add(next.id);
      try {
        await this.runClaimed(next);
      } finally {
        this.inFlight.delete(next.id);
      }
    }
  }

  private async runClaimed(record: AttachmentUpload): Promise<void> {
    await this.cfg.store.put({ ...record, status: 'uploading' });
    try {
      const remoteUrl = await this.cfg.uploader.upload(record);
      await this.cfg.store.put({
        ...record,
        status: 'uploaded',
        remoteUrl,
        lastError: undefined,
      });
    } catch (err) {
      await this.handleFailure(record, err);
    }
  }

  private async handleFailure(
    record: AttachmentUpload,
    err: unknown,
  ): Promise<void> {
    const attempts = record.attempts + 1;
    const message = err instanceof Error ? err.message : String(err);

    if (attempts >= this.cfg.maxAttempts) {
      // Exhausted retries — park it as failed for manual retry/inspection.
      await this.cfg.store.put({
        ...record,
        status: 'failed',
        attempts,
        lastError: message,
      });
      return;
    }

    const delay = Math.min(
      this.cfg.backoffMaxMs,
      this.cfg.backoffBaseMs * 2 ** (attempts - 1),
    );
    await this.cfg.store.put({
      ...record,
      status: 'queued',
      attempts,
      nextAttemptAt: this.cfg.now() + delay,
      lastError: message,
    });
    // Wake up when the backoff elapses (a network event may drain us sooner).
    if (!this.stopped) this.cfg.schedule(() => this.kick(), delay);
  }
}
