import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';
import {
  BOARD_ROOM_PATTERN,
  boardReplayKey,
  boardRoom,
  boardSequenceKey,
  REPLAY_LOG_MAX_EVENTS,
  REPLAY_LOG_TTL_SECONDS,
} from './realtime.constants';
import { BoardMutationEnvelope } from './dto/board-mutation';

/** node-redis v4 client type without wrestling its generics. */
type RedisClient = ReturnType<typeof createClient>;

/** Callback invoked for every mutation frame received on a board channel. */
export type BoardMessageHandler = (
  channel: string,
  envelope: BoardMutationEnvelope,
) => void;

/**
 * Owns the Redis connections behind the pipeline and centralises every Redis
 * interaction so the gateway and the service layer stay Redis-agnostic.
 *
 * A single Redis connection cannot both issue commands and be in subscriber
 * mode, so we keep two: `publisher` for INCR/ZADD/PUBLISH and a duplicated
 * `subscriber` that pattern-subscribes to every board channel. Because each
 * app instance publishes to and subscribes from the same channels, this fans
 * out across a horizontally-scaled gateway cluster with no extra wiring.
 */
@Injectable()
export class RedisPubSubService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisPubSubService.name);
  private publisher!: RedisClient;
  private subscriber!: RedisClient;
  private messageHandler: BoardMessageHandler | null = null;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const url = this.resolveRedisUrl();
    this.publisher = createClient({ url });
    this.publisher.on('error', (err) =>
      this.logger.error(`Redis publisher error: ${String(err)}`),
    );
    await this.publisher.connect();

    // A dedicated connection for subscriber mode.
    this.subscriber = this.publisher.duplicate();
    this.subscriber.on('error', (err) =>
      this.logger.error(`Redis subscriber error: ${String(err)}`),
    );
    await this.subscriber.connect();

    await this.subscriber.pSubscribe(BOARD_ROOM_PATTERN, (message, channel) =>
      this.dispatch(channel, message),
    );
    this.logger.log(`Subscribed to Redis pattern ${BOARD_ROOM_PATTERN}`);
  }

  async onModuleDestroy(): Promise<void> {
    // Best-effort teardown; quit() flushes pending commands then disconnects.
    await Promise.allSettled([this.subscriber?.quit(), this.publisher?.quit()]);
  }

  /** Register the (single) handler the gateway uses to broadcast to rooms. */
  onBoardMessage(handler: BoardMessageHandler): void {
    this.messageHandler = handler;
  }

  /**
   * Allocate the next monotonic sequence id for a board. INCR is atomic, so
   * concurrent writers across the cluster each get a distinct, ordered id.
   */
  async nextSequence(boardId: string): Promise<number> {
    return this.publisher.incr(boardSequenceKey(boardId));
  }

  /**
   * Persist a frame in the board's replay log (sorted set scored by seq),
   * trim it to the retention window, and refresh its TTL — all so a
   * reconnecting client can delta-sync the gap it missed.
   */
  async appendToReplayLog(envelope: BoardMutationEnvelope): Promise<void> {
    const key = boardReplayKey(envelope.boardId);
    await this.publisher
      .multi()
      .zAdd(key, { score: envelope.seq, value: JSON.stringify(envelope) })
      // Keep only the newest REPLAY_LOG_MAX_EVENTS (drop lowest-scored extras).
      .zRemRangeByRank(key, 0, -(REPLAY_LOG_MAX_EVENTS + 1))
      .expire(key, REPLAY_LOG_TTL_SECONDS)
      .exec();
  }

  /** Publish a mutation frame to the board's Pub/Sub channel. */
  async publishMutation(envelope: BoardMutationEnvelope): Promise<void> {
    await this.publisher.publish(
      boardRoom(envelope.boardId),
      JSON.stringify(envelope),
    );
  }

  /** Current head sequence for a board (0 if nothing has been published). */
  async currentSequence(boardId: string): Promise<number> {
    const raw = await this.publisher.get(boardSequenceKey(boardId));
    return raw ? Number(raw) : 0;
  }

  /**
   * Ordered frames a client missed: everything with seq strictly greater than
   * `afterSeq`. Sequence ids are integers, so `afterSeq + 1` is the exclusive
   * lower bound without needing Redis's `(` range syntax.
   */
  async getMissedEvents(
    boardId: string,
    afterSeq: number,
  ): Promise<BoardMutationEnvelope[]> {
    const lowerBound = Math.max(0, Math.floor(afterSeq)) + 1;
    const raw = await this.publisher.zRangeByScore(
      boardReplayKey(boardId),
      lowerBound,
      '+inf',
    );
    return raw
      .map((value) => this.parseEnvelope(value))
      .filter((env): env is BoardMutationEnvelope => env !== null);
  }

  private dispatch(channel: string, message: string): void {
    if (!this.messageHandler) return;
    const envelope = this.parseEnvelope(message);
    if (envelope) {
      this.messageHandler(channel, envelope);
    }
  }

  private parseEnvelope(value: string): BoardMutationEnvelope | null {
    try {
      return JSON.parse(value) as BoardMutationEnvelope;
    } catch {
      this.logger.warn('Discarded malformed board mutation frame');
      return null;
    }
  }

  private resolveRedisUrl(): string {
    const explicit = this.config.get<string>('REDIS_URL');
    if (explicit) return explicit;
    const host = this.config.get<string>('REDIS_HOST', 'localhost');
    const port = this.config.get<string>('REDIS_PORT', '6379');
    return `redis://${host}:${port}`;
  }
}
