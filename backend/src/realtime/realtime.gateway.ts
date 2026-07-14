import { Logger, UseFilters, ValidationPipe, UsePipes } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RedisPubSubService } from './redis-pubsub.service';
import { TenantAccessService } from '../common/tenant/tenant-access.service';
import { WsExceptionFilter } from './ws-exception.filter';
import {
  boardIdFromRoomChannel,
  boardRoom,
  WS_EVENTS,
} from './realtime.constants';
import {
  BoardJoinRequest,
  BoardMutationEnvelope,
  BoardSyncRequest,
} from './dto/board-mutation';

/**
 * Reflected CORS origins for the socket handshake. Read from the environment at
 * class-definition time (mirrors the REST CORS config in `main.ts`).
 */
const corsOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim());

/**
 * Socket.io gateway that fronts the real-time pipeline. It never touches the
 * database on the hot path: it only relays frames that the Redis subscriber
 * hands it into the matching board room, and serves delta-sync replays out of
 * the Redis replay log. The one DB touch is validating board ownership when a
 * client joins, which enforces the multi-tenancy boundary (`.cursorrules` §1).
 */
@UseFilters(new WsExceptionFilter())
@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: corsOrigins, credentials: true },
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly redis: RedisPubSubService,
    private readonly tenantAccess: TenantAccessService,
  ) {}

  afterInit(): void {
    // Every frame the Redis subscriber receives is fanned out to the room.
    // Because all instances subscribe to the same channels, a frame published
    // by any instance reaches sockets connected to every instance.
    this.redis.onBoardMessage((channel, envelope) =>
      this.broadcast(channel, envelope),
    );
    this.logger.log('Realtime gateway initialised');
  }

  handleConnection(client: Socket): void {
    this.logger.debug(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @SubscribeMessage(WS_EVENTS.JOIN)
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: BoardJoinRequest,
  ): Promise<void> {
    const boardId = this.requireBoardId(body?.boardId);
    const orgId = this.requireOrgId(client);
    // Fail closed: a socket may only join a board its org actually owns.
    await this.tenantAccess.assertBoardInOrg(boardId, orgId);

    await client.join(boardRoom(boardId));
    const headSeq = await this.redis.currentSequence(boardId);
    client.emit(WS_EVENTS.JOINED, { boardId, headSeq });
    this.logger.debug(`Socket ${client.id} joined board ${boardId}`);
  }

  @SubscribeMessage(WS_EVENTS.LEAVE)
  async handleLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: BoardJoinRequest,
  ): Promise<void> {
    const boardId = this.requireBoardId(body?.boardId);
    await client.leave(boardRoom(boardId));
  }

  /**
   * Delta-sync: replay every frame the client missed while it was away. The
   * client sends the highest sequence it has applied; we return the ordered
   * gap plus the current head so it can tell whether it's fully caught up.
   */
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @SubscribeMessage(WS_EVENTS.SYNC)
  async handleSync(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: BoardSyncRequest,
  ): Promise<void> {
    const boardId = this.requireBoardId(body?.boardId);
    const orgId = this.requireOrgId(client);
    await this.tenantAccess.assertBoardInOrg(boardId, orgId);

    const lastSeq = Number.isFinite(body?.lastSeq) ? body.lastSeq : 0;
    const events = await this.redis.getMissedEvents(boardId, lastSeq);
    const headSeq = await this.redis.currentSequence(boardId);
    client.emit(WS_EVENTS.SYNC_RESULT, { boardId, events, headSeq });
  }

  private broadcast(channel: string, envelope: BoardMutationEnvelope): void {
    const boardId = boardIdFromRoomChannel(channel);
    if (!boardId) return;
    this.server.to(boardRoom(boardId)).emit(WS_EVENTS.MUTATION, envelope);
  }

  private requireBoardId(boardId: string | undefined): string {
    if (!boardId || typeof boardId !== 'string') {
      throw new WsException('boardId is required');
    }
    return boardId;
  }

  /** The active org travels in the handshake auth, set by the client on connect. */
  private requireOrgId(client: Socket): string {
    const orgId = client.handshake.auth?.orgId as string | undefined;
    if (!orgId || typeof orgId !== 'string') {
      throw new WsException('Missing orgId in handshake auth');
    }
    return orgId;
  }
}
