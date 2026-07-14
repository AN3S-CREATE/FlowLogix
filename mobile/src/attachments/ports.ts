/** Lifecycle of a queued attachment upload. */
export type UploadStatus = 'queued' | 'uploading' | 'uploaded' | 'failed';

/**
 * A large file staged in local storage, awaiting a good network to upload. The
 * binary stays on disk (`localUri`); only this lightweight record lives in the
 * queue table, so restarting the app resumes exactly where it left off.
 */
export interface AttachmentUpload {
  id: string;
  /** Card the attachment belongs to. */
  cardId: string;
  /** file:// path to the staged bytes in the app's local storage. */
  localUri: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: UploadStatus;
  /** Failed attempts so far — drives backoff and the give-up threshold. */
  attempts: number;
  /** Epoch ms before which the item shouldn't be retried (backoff). */
  nextAttemptAt: number;
  /** Set once uploaded. */
  remoteUrl?: string;
  /** Last error message, for surfacing/telemetry. */
  lastError?: string;
}

export type NewAttachmentUpload = Omit<
  AttachmentUpload,
  'status' | 'attempts' | 'nextAttemptAt' | 'remoteUrl' | 'lastError'
>;

/** Persistence port for the queue (WatermelonDB `attachment_uploads` in-app). */
export interface UploadStore {
  put(record: AttachmentUpload): Promise<void>;
  get(id: string): Promise<AttachmentUpload | null>;
  /**
   * `queued` items whose backoff has elapsed (`nextAttemptAt <= now`), oldest
   * first. `failed` items are terminal — they are NOT returned here (only a
   * manual `retry` re-queues them), otherwise the drain loop would spin on a
   * permanently-failing upload.
   */
  listRunnable(now: number): Promise<AttachmentUpload[]>;
  remove(id: string): Promise<void>;
}

/** Performs the actual transfer; returns the durable remote URL on success. */
export interface AttachmentUploader {
  upload(record: AttachmentUpload): Promise<string>;
}
