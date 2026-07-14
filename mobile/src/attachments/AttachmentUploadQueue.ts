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

/**
 * Background upload queue for large attachments.
 *
 * Files are staged in local storage the moment the user attaches them (fully
 * offline), and the actual transfer is deferred until the device is on a
 * connection worth spending bytes on — **Wi-Fi or cellular/LTE**, never while
 * offline (see `isSuitableForLargeUpload`). The queue survives restarts because
 * every item is persisted; on a network upgrade it drains automatically, with
 * bounded concurrency and exponential backoff on failure.
 */
export class AttachmentUploadQueue {
  private readonly cfg: Required<AttachmentQueueConfig>;
  private inFlight = new Set<string>();
  private unsubscribe: (() => void) | null = null;
  /** Re-entrancy guard so only one drain loop runs at a time. */
  private draining = false;
  /** Set when `process` is called mid-drain, so the loop takes another pass. */
  private rerun = false;

  constructor(config: AttachmentQueueConfig) {
    this.cfg = {
      maxConcurrent: 2,
      maxAttempts: 6,
      backoffBaseMs: 2000,
      backoffMaxMs: 5 * 60 * 1000,
      now: () => Date.now(),
      schedule: (fn, ms) => {
        setTimeout(fn, ms);
      },
      ...config,
    };
  }

  /** Start draining automatically whenever the network becomes suitable. */
  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.cfg.network.subscribe(() => {
      void this.process();
    });
    void this.process();
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
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
    void this.process();
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
    void this.process();
  }

  /**
   * Drain the queue while the network stays suitable and there's spare
   * concurrency. A single drain loop runs at a time (`draining` guard); calls
   * that arrive mid-drain flip `rerun` so the loop takes another pass and picks
   * up anything enqueued in the meantime — no work is stranded and there are no
   * floating recursive calls to leak between runs.
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
        while (isSuitableForLargeUpload(this.cfg.network)) {
          const capacity = this.cfg.maxConcurrent - this.inFlight.size;
          if (capacity <= 0) break;

          const batch = (await this.cfg.store.listRunnable(this.cfg.now()))
            // Only auto-run queued items. `failed` is terminal (retries
            // exhausted) — it must not be picked up here, or the loop would
            // spin on it forever since its backoff is already in the past.
            .filter((r) => r.status === 'queued' && !this.inFlight.has(r.id))
            .slice(0, capacity);
          if (batch.length === 0) break;

          await Promise.all(batch.map((record) => this.run(record)));
        }
      }
    } finally {
      this.draining = false;
    }
  }

  private async run(record: AttachmentUpload): Promise<void> {
    this.inFlight.add(record.id);
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
    } finally {
      this.inFlight.delete(record.id);
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
    const nextAttemptAt = this.cfg.now() + delay;
    await this.cfg.store.put({
      ...record,
      status: 'queued',
      attempts,
      nextAttemptAt,
      lastError: message,
    });
    // Wake up when the backoff elapses (a network event may drain us sooner).
    this.cfg.schedule(() => void this.process(), delay);
  }
}
