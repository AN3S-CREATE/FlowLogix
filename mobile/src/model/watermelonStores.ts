import { Database, Q } from '@nozbe/watermelondb';
import type { DirtyRaw } from '@nozbe/watermelondb/RawRecord';
import { LocalRecord, LocalStore } from '../sync/ports';
import {
  AttachmentUpload,
  UploadStatus,
  UploadStore,
} from '../attachments/ports';
import { Card } from './Card';
import { AttachmentUploadModel } from './AttachmentUploadModel';

/**
 * WatermelonDB-backed implementations of the sync/upload ports. These are the
 * only files that know both the CRDT shapes *and* the SQLite columns; the
 * engine and queue stay storage-agnostic. Kept concrete (per collection) so the
 * column<->field mapping is fully typed rather than stringly-generic.
 */

export interface CardFields {
  listId: string;
  title: string;
  description: string | null;
  positionIdx: string;
  isComplete: boolean;
  [key: string]: unknown;
}

function cardToLocalRecord(card: Card): LocalRecord<CardFields> {
  return {
    id: card.id,
    fields: {
      listId: card.listId,
      title: card.title,
      description: card.description,
      positionIdx: card.positionIdx,
      isComplete: card.isComplete,
    },
    clocks: {
      listId: card.listIdUpdatedAt,
      title: card.titleUpdatedAt,
      description: card.descriptionUpdatedAt,
      positionIdx: card.positionIdxUpdatedAt,
      isComplete: card.isCompleteUpdatedAt,
    },
    nodeId: card.nodeId,
    deletedAt: card.deletedAt,
    pending: card.pending,
  };
}

/** Flatten a versioned card into the SQLite column layout (a DirtyRaw). */
function localRecordToRaw(record: LocalRecord<CardFields>): DirtyRaw {
  return {
    id: record.id,
    list_id: record.fields.listId,
    list_id_updated_at: record.clocks.listId,
    title: record.fields.title,
    title_updated_at: record.clocks.title,
    description: record.fields.description ?? null,
    description_updated_at: record.clocks.description,
    position_idx: record.fields.positionIdx,
    position_idx_updated_at: record.clocks.positionIdx,
    is_complete: record.fields.isComplete,
    is_complete_updated_at: record.clocks.isComplete,
    node_id: record.nodeId,
    deleted_at: record.deletedAt,
    pending: record.pending,
  };
}

export class WatermelonCardStore implements LocalStore<CardFields> {
  private readonly collection;

  constructor(private readonly database: Database) {
    this.collection = database.get<Card>('cards');
  }

  async getById(id: string): Promise<LocalRecord<CardFields> | null> {
    const rows = await this.collection.query(Q.where('id', id)).fetch();
    return rows.length > 0 ? cardToLocalRecord(rows[0]) : null;
  }

  async getPending(): Promise<LocalRecord<CardFields>[]> {
    const rows = await this.collection
      .query(Q.where('pending', true))
      .fetch();
    return rows.map(cardToLocalRecord);
  }

  async put(record: LocalRecord<CardFields>): Promise<void> {
    const raw = localRecordToRaw(record);
    await this.database.write(async () => {
      const existing = await this.collection.query(Q.where('id', record.id)).fetch();
      if (existing.length === 0) {
        await this.database.batch(
          this.collection.prepareCreateFromDirtyRaw(raw),
        );
      } else {
        await existing[0].update((card) => {
          card.listId = record.fields.listId;
          card.listIdUpdatedAt = record.clocks.listId;
          card.title = record.fields.title;
          card.titleUpdatedAt = record.clocks.title;
          card.description = record.fields.description;
          card.descriptionUpdatedAt = record.clocks.description;
          card.positionIdx = record.fields.positionIdx;
          card.positionIdxUpdatedAt = record.clocks.positionIdx;
          card.isComplete = record.fields.isComplete;
          card.isCompleteUpdatedAt = record.clocks.isComplete;
          card.nodeId = record.nodeId;
          card.deletedAt = record.deletedAt;
          card.pending = record.pending;
        });
      }
    });
  }
}

function modelToUpload(model: AttachmentUploadModel): AttachmentUpload {
  return {
    id: model.id,
    cardId: model.cardId,
    localUri: model.localUri,
    filename: model.filename,
    mimeType: model.mimeType,
    sizeBytes: model.sizeBytes,
    status: model.status as UploadStatus,
    attempts: model.attempts,
    nextAttemptAt: model.nextAttemptAt,
    remoteUrl: model.remoteUrl ?? undefined,
    lastError: model.lastError ?? undefined,
  };
}

export class WatermelonAttachmentStore implements UploadStore {
  private readonly collection;

  constructor(private readonly database: Database) {
    this.collection = database.get<AttachmentUploadModel>('attachment_uploads');
  }

  async get(id: string): Promise<AttachmentUpload | null> {
    const rows = await this.collection.query(Q.where('id', id)).fetch();
    return rows.length > 0 ? modelToUpload(rows[0]) : null;
  }

  async listRunnable(now: number): Promise<AttachmentUpload[]> {
    const rows = await this.collection
      .query(
        Q.where('status', 'queued'),
        Q.where('next_attempt_at', Q.lte(now)),
        Q.sortBy('next_attempt_at', Q.asc),
      )
      .fetch();
    return rows.map(modelToUpload);
  }

  async put(record: AttachmentUpload): Promise<void> {
    const raw: DirtyRaw = {
      id: record.id,
      card_id: record.cardId,
      local_uri: record.localUri,
      filename: record.filename,
      mime_type: record.mimeType,
      size_bytes: record.sizeBytes,
      status: record.status,
      attempts: record.attempts,
      next_attempt_at: record.nextAttemptAt,
      remote_url: record.remoteUrl ?? null,
      last_error: record.lastError ?? null,
    };
    await this.database.write(async () => {
      const existing = await this.collection.query(Q.where('id', record.id)).fetch();
      if (existing.length === 0) {
        await this.database.batch(
          this.collection.prepareCreateFromDirtyRaw(raw),
        );
      } else {
        await existing[0].update((row) => {
          row.status = record.status;
          row.attempts = record.attempts;
          row.nextAttemptAt = record.nextAttemptAt;
          row.remoteUrl = record.remoteUrl ?? null;
          row.lastError = record.lastError ?? null;
        });
      }
    });
  }

  async remove(id: string): Promise<void> {
    await this.database.write(async () => {
      const rows = await this.collection.query(Q.where('id', id)).fetch();
      if (rows.length > 0) await rows[0].markAsDeleted();
    });
  }
}
