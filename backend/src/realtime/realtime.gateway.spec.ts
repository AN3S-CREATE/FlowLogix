import { RealtimeGateway } from './realtime.gateway';
import {
  RedisPubSubService,
  BoardMessageHandler,
} from './redis-pubsub.service';
import { TenantAccessService } from '../common/tenant/tenant-access.service';
import { MetricsService } from '../health/metrics.service';
import { boardRoom, WS_EVENTS } from './realtime.constants';
import { BoardMutationEnvelope } from './dto/board-mutation';

function mockSocket(orgId: string | undefined) {
  return {
    id: 'sock-1',
    join: jest.fn().mockResolvedValue(undefined),
    leave: jest.fn().mockResolvedValue(undefined),
    emit: jest.fn(),
    handshake: { auth: orgId ? { orgId } : {} },
  };
}

describe('RealtimeGateway', () => {
  let gateway: RealtimeGateway;
  let redis: jest.Mocked<
    Pick<
      RedisPubSubService,
      'onBoardMessage' | 'currentSequence' | 'getMissedEvents'
    >
  >;
  let tenant: jest.Mocked<Pick<TenantAccessService, 'assertBoardInOrg'>>;
  let capturedHandler: BoardMessageHandler | undefined;
  const roomEmit = jest.fn();

  beforeEach(() => {
    capturedHandler = undefined;
    roomEmit.mockClear();
    redis = {
      onBoardMessage: jest.fn((h: BoardMessageHandler) => {
        capturedHandler = h;
      }),
      currentSequence: jest.fn().mockResolvedValue(3),
      getMissedEvents: jest.fn().mockResolvedValue([]),
    };
    tenant = {
      assertBoardInOrg: jest.fn().mockResolvedValue({ id: 'board-1' }),
    };

    const metrics = {
      setWebsocketPoolSize: jest.fn(),
      setActiveBoardUsers: jest.fn(),
    } as unknown as MetricsService;
    gateway = new RealtimeGateway(
      redis as unknown as RedisPubSubService,
      tenant as unknown as TenantAccessService,
      metrics,
    );
    (gateway as unknown as { server: unknown }).server = {
      to: jest.fn().mockReturnValue({ emit: roomEmit }),
    };
  });

  it('registers a Redis message handler on init that broadcasts to the room', () => {
    gateway.afterInit();
    expect(redis.onBoardMessage).toHaveBeenCalled();

    const envelope: BoardMutationEnvelope = {
      seq: 4,
      boardId: 'board-1',
      type: 'card.moved',
      payload: { cardId: 'c1', listId: 'l2', positionIdx: 1 },
      ts: 1,
    };
    // Simulate a frame arriving from Redis on the board channel.
    capturedHandler?.(boardRoom('board-1'), envelope);

    const server = (gateway as unknown as { server: { to: jest.Mock } }).server;
    expect(server.to).toHaveBeenCalledWith(boardRoom('board-1'));
    expect(roomEmit).toHaveBeenCalledWith(WS_EVENTS.MUTATION, envelope);
  });

  it('validates board ownership, joins the room, and acks the head sequence', async () => {
    const client = mockSocket('org-1');
    await gateway.handleJoin(client as never, { boardId: 'board-1' });

    expect(tenant.assertBoardInOrg).toHaveBeenCalledWith('board-1', 'org-1');
    expect(client.join).toHaveBeenCalledWith(boardRoom('board-1'));
    expect(client.emit).toHaveBeenCalledWith(WS_EVENTS.JOINED, {
      boardId: 'board-1',
      headSeq: 3,
    });
  });

  it('rejects a join without an org in the handshake', async () => {
    const client = mockSocket(undefined);
    await expect(
      gateway.handleJoin(client as never, { boardId: 'board-1' }),
    ).rejects.toThrow(/orgId/);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('rejects a join without a boardId', async () => {
    const client = mockSocket('org-1');
    await expect(
      gateway.handleJoin(client as never, { boardId: '' }),
    ).rejects.toThrow(/boardId/);
  });

  it('delta-syncs missed frames for a reconnecting client', async () => {
    const missed: BoardMutationEnvelope[] = [
      {
        seq: 2,
        boardId: 'board-1',
        type: 'card.updated',
        payload: { cardId: 'c1' },
        ts: 1,
      },
    ];
    redis.getMissedEvents.mockResolvedValueOnce(missed);
    const client = mockSocket('org-1');

    await gateway.handleSync(client as never, {
      boardId: 'board-1',
      lastSeq: 1,
    });

    expect(tenant.assertBoardInOrg).toHaveBeenCalledWith('board-1', 'org-1');
    expect(redis.getMissedEvents).toHaveBeenCalledWith('board-1', 1);
    expect(client.emit).toHaveBeenCalledWith(WS_EVENTS.SYNC_RESULT, {
      boardId: 'board-1',
      events: missed,
      headSeq: 3,
    });
  });

  it('leaves the board room on request', async () => {
    const client = mockSocket('org-1');
    await gateway.handleLeave(client as never, { boardId: 'board-1' });
    expect(client.leave).toHaveBeenCalledWith(boardRoom('board-1'));
  });
});
