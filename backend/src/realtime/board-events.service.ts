import { Injectable, Logger } from '@nestjs/common';
import { RedisPubSubService } from './redis-pubsub.service';
import {
  BoardMutationEnvelope,
  BoardMutationPayload,
  BoardMutationType,
} from './dto/board-mutation';

/**
 * The seam that decouples HTTP writes from WebSocket broadcasts (`.cursorrules`
 * §4). Services call `emit(...)` *after* a mutation is committed to Postgres;
 * this stamps a per-board sequence id, appends the frame to the replay log, and
 * publishes it to Redis. The gateway — not the DB write — is what ultimately
 * pushes the frame to peers.
 *
 * Publishing is best-effort: the database write is the source of truth, so a
 * Redis hiccup is logged and swallowed rather than allowed to fail the API
 * request. Peers reconcile via delta-sync on their next reconnect.
 */
@Injectable()
export class BoardEventsService {
  private readonly logger = new Logger(BoardEventsService.name);

  constructor(private readonly redis: RedisPubSubService) {}

  async emit(
    type: BoardMutationType,
    boardId: string,
    payload: BoardMutationPayload,
  ): Promise<void> {
    try {
      const seq = await this.redis.nextSequence(boardId);
      const envelope: BoardMutationEnvelope = {
        seq,
        boardId,
        type,
        payload,
        ts: Date.now(),
      };
      // Persist for replay first, then publish — a live subscriber that fell
      // behind can still recover the frame from the log via delta-sync.
      await this.redis.appendToReplayLog(envelope);
      await this.redis.publishMutation(envelope);
    } catch (err) {
      this.logger.error(
        `Failed to broadcast ${type} for board ${boardId}: ${String(err)}`,
      );
    }
  }
}
