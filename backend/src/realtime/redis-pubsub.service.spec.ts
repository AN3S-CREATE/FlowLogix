import { ConfigService } from '@nestjs/config';
import { RedisPubSubService } from './redis-pubsub.service';
import { BoardMutationEnvelope } from './dto/board-mutation';
import {
  boardReplayKey,
  boardRoom,
  boardSequenceKey,
} from './realtime.constants';

interface MultiChain {
  zAdd: jest.Mock;
  zRemRangeByRank: jest.Mock;
  expire: jest.Mock;
  exec: jest.Mock;
}

/**
 * Chainable stand-in for `client.multi()`. Each pipeline step returns the same
 * object; `exec` resolves like the real transaction.
 */
function makeMultiChain(): MultiChain {
  const chain: MultiChain = {
    zAdd: jest.fn(() => chain),
    zRemRangeByRank: jest.fn(() => chain),
    expire: jest.fn(() => chain),
    exec: jest.fn().mockResolvedValue([]),
  };
  return chain;
}

function makeMockClient() {
  const multi = makeMultiChain();
  return {
    incr: jest.fn().mockResolvedValue(7),
    get: jest.fn().mockResolvedValue('42'),
    publish: jest.fn().mockResolvedValue(1),
    zRangeByScore: jest.fn().mockResolvedValue([]),
    multi: jest.fn().mockReturnValue(multi),
    _multi: multi,
  };
}

function envelope(seq: number): BoardMutationEnvelope {
  return {
    seq,
    boardId: 'board-1',
    type: 'card.moved',
    payload: { cardId: 'c1', listId: 'l2', positionIdx: 3 },
    ts: 1_000,
  };
}

describe('RedisPubSubService', () => {
  let service: RedisPubSubService;
  let client: ReturnType<typeof makeMockClient>;

  beforeEach(() => {
    service = new RedisPubSubService(new ConfigService());
    client = makeMockClient();
    // Inject the mock in place of the connection created in onModuleInit.
    (service as unknown as { publisher: unknown }).publisher = client;
  });

  it('allocates a sequence via INCR on the per-board key', async () => {
    const seq = await service.nextSequence('board-1');
    expect(client.incr).toHaveBeenCalledWith(boardSequenceKey('board-1'));
    expect(seq).toBe(7);
  });

  it('appends to the replay log, trims to the retention window, and sets a TTL', async () => {
    await service.appendToReplayLog(envelope(7));
    const key = boardReplayKey('board-1');
    expect(client._multi.zAdd).toHaveBeenCalledWith(key, {
      score: 7,
      value: JSON.stringify(envelope(7)),
    });
    // Trim keeps only the newest N (negative rank drops the lowest scores).
    expect(client._multi.zRemRangeByRank).toHaveBeenCalledWith(
      key,
      0,
      expect.any(Number),
    );
    expect(client._multi.expire).toHaveBeenCalled();
    expect(client._multi.exec).toHaveBeenCalled();
  });

  it('publishes the frame to the board room channel as JSON', async () => {
    await service.publishMutation(envelope(7));
    expect(client.publish).toHaveBeenCalledWith(
      boardRoom('board-1'),
      JSON.stringify(envelope(7)),
    );
  });

  it('reads the current head sequence (0 when unset)', async () => {
    expect(await service.currentSequence('board-1')).toBe(42);
    client.get.mockResolvedValueOnce(null);
    expect(await service.currentSequence('board-1')).toBe(0);
  });

  it('returns only frames strictly after the given sequence', async () => {
    client.zRangeByScore.mockResolvedValueOnce([
      JSON.stringify(envelope(5)),
      'not-json',
      JSON.stringify(envelope(6)),
    ]);
    const events = await service.getMissedEvents('board-1', 4);
    // afterSeq + 1 is the inclusive lower bound passed to Redis.
    expect(client.zRangeByScore).toHaveBeenCalledWith(
      boardReplayKey('board-1'),
      5,
      '+inf',
    );
    // Malformed frames are dropped, valid ones parsed.
    expect(events.map((e) => e.seq)).toEqual([5, 6]);
  });

  it('dispatches parsed frames to the registered handler and ignores garbage', () => {
    const handler = jest.fn();
    service.onBoardMessage(handler);
    const dispatch = (
      service as unknown as { dispatch: (c: string, m: string) => void }
    ).dispatch.bind(service);

    dispatch(boardRoom('board-1'), JSON.stringify(envelope(7)));
    expect(handler).toHaveBeenCalledWith(boardRoom('board-1'), envelope(7));

    handler.mockClear();
    dispatch(boardRoom('board-1'), '{bad json');
    expect(handler).not.toHaveBeenCalled();
  });
});
