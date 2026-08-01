import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

/** Cap the change log per request so one call can't exhaust memory/DB time. */
export const MAX_SYNC_CHANGES = 1000;

/** Collections the mobile client syncs (must match the mobile `CollectionName`). */
export const SYNC_COLLECTIONS = ['boards', 'lists', 'cards'] as const;
export type SyncCollection = (typeof SYNC_COLLECTIONS)[number];

/**
 * One record's change as it travels over the wire — the CRDT-versioned shape the
 * mobile `HttpSyncTransport` sends and receives: field values, their per-field
 * `<field>_updated_at` clocks, the writer's replica id, and the deletion stamp.
 */
export class SyncChangeDto {
  @IsString()
  id: string;

  @IsObject()
  fields: Record<string, unknown>;

  @IsObject()
  clocks: Record<string, number>;

  @IsString()
  nodeId: string;

  @IsOptional()
  @IsInt()
  deletedAt: number | null = null;
}

export class SyncRequestDto {
  @IsIn(SYNC_COLLECTIONS)
  collection: SyncCollection;

  /** The client's last checkpoint (0 = full push only; >0 enables delta-pull). */
  @IsInt()
  @Min(0)
  sinceCheckpoint: number;

  @IsArray()
  @ArrayMaxSize(MAX_SYNC_CHANGES)
  @ValidateNested({ each: true })
  @Type(() => SyncChangeDto)
  changes: SyncChangeDto[];
}

export interface SyncResponseDto {
  /** Records where the server holds something newer — the client re-merges these. */
  changes: SyncChangeDto[];
  /** Server's high-precision clock at response time; the next `sinceCheckpoint`. */
  checkpoint: number;
  /** Ids the server accepted (committed the client's fields) → client clears pending. */
  acceptedIds: string[];
}
