import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

/**
 * Local SQLite row backing the attachment upload queue. The binary itself stays
 * on disk at `localUri`; this record tracks where it goes and its retry state,
 * so uploads survive app restarts and resume when the network is suitable.
 */
export class AttachmentUploadModel extends Model {
  static table = 'attachment_uploads';

  @text('card_id') cardId!: string;
  @text('local_uri') localUri!: string;
  @text('filename') filename!: string;
  @text('mime_type') mimeType!: string;
  @field('size_bytes') sizeBytes!: number;
  @text('status') status!: string;
  @field('attempts') attempts!: number;
  @field('next_attempt_at') nextAttemptAt!: number;
  @text('remote_url') remoteUrl!: string | null;
  @text('last_error') lastError!: string | null;
}
