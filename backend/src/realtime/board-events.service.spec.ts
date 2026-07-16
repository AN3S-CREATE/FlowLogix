import { BoardEventsService } from './board-events.service';
import { RedisPubSubService } from './redis-pubsub.service';
import { BoardMutationEnvelope } from './dto/board-mutation';

describe('BoardEventsService', () => {
  let service: BoardEventsService;
  let redis: jest.Mocked<
    Pick<
      RedisPubSubService,
      'nextSequence' | 'appendToReplayLog' | 'publishMutation'
    >
  >;

  beforeEach(() => {
    redis = {
      nextSequence: jest.fn().mockResolvedValue(11),
      appendToReplayLog: jest.fn().mockResolvedValue(undefined),
      publishMutation: jest.fn().mockResolvedValue(undefined),
    };
    service = new BoardEventsService(redis as unknown as RedisPubSubService);
  });

  it('stamps a sequence, logs for replay, then publishes the envelope', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_234);

    await service.emit('card.moved', 'board-9', {
      cardId: 'c1',
      listId: 'l2',
      positionIdx: 'g',
    });

    const expected: BoardMutationEnvelope = {
      seq: 11,
      boardId: 'board-9',
      type: 'card.moved',
      payload: { cardId: 'c1', listId: 'l2', positionIdx: 'g' },
      ts: 1_234,
    };
    expect(redis.nextSequence).toHaveBeenCalledWith('board-9');
    expect(redis.appendToReplayLog).toHaveBeenCalledWith(expected);
    expect(redis.publishMutation).toHaveBeenCalledWith(expected);
    // Replay log is written before the publish so a lagging subscriber recovers.
    const appendOrder = redis.appendToReplayLog.mock.invocationCallOrder[0];
    const publishOrder = redis.publishMutation.mock.invocationCallOrder[0];
    expect(appendOrder).toBeLessThan(publishOrder);
  });

  it('swallows Redis failures so the committed DB write is never rolled back', async () => {
    redis.nextSequence.mockRejectedValueOnce(new Error('redis down'));
    await expect(
      service.emit('card.deleted', 'board-9', { cardId: 'c1', listId: 'l2' }),
    ).resolves.toBeUndefined();
    expect(redis.publishMutation).not.toHaveBeenCalled();
  });
});
