import { describe, it, expect } from 'vitest';
import {
  FetchInit,
  FetchLike,
  FetchResponse,
  HttpSyncTransport,
} from './httpSyncTransport';
import { RemoteChange } from './ports';

interface CardFields {
  title: string;
  listId: string;
  [key: string]: unknown;
}

interface Call {
  url: string;
  init: FetchInit;
}

/** A fake fetch that records calls and returns a scripted JSON response. */
function fakeFetch(
  responder: (call: Call) => Partial<FetchResponse> & { body?: unknown },
): { fetchImpl: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const call = { url, init };
    calls.push(call);
    const r = responder(call);
    const body = r.body ?? {};
    return {
      ok: r.ok ?? true,
      status: r.status ?? 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } satisfies FetchResponse;
  };
  return { fetchImpl, calls };
}

const remote = (id: string, title: string, clock: number): RemoteChange<CardFields> => ({
  id,
  fields: { title, listId: 'l1' },
  clocks: { title: clock, listId: clock },
  nodeId: 'server',
  deletedAt: null,
});

describe('HttpSyncTransport', () => {
  it('pull posts an empty change log and returns server changes + checkpoint', async () => {
    const server = remote('c1', 'from server', 500);
    const { fetchImpl, calls } = fakeFetch(() => ({
      body: { changes: [server], checkpoint: 999, acceptedIds: [] },
    }));
    const t = new HttpSyncTransport<CardFields>({
      baseUrl: 'https://edge.test',
      fetchImpl,
    });

    const result = await t.pull('cards', 100);

    expect(result.changes).toEqual([server]);
    expect(result.checkpoint).toBe(999);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://edge.test/sync');
    expect(calls[0].init.method).toBe('POST');
    const sent = JSON.parse(calls[0].init.body);
    expect(sent).toMatchObject({
      collection: 'cards',
      sinceCheckpoint: 100,
      changes: [],
    });
  });

  it('push sends the change log and returns the accepted ids', async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({
      body: { changes: [], checkpoint: 1000, acceptedIds: ['c1', 'c2'] },
    }));
    const t = new HttpSyncTransport<CardFields>({
      baseUrl: 'https://edge.test',
      fetchImpl,
    });

    const changes = [remote('c1', 'a', 10), remote('c2', 'b', 20)];
    const result = await t.push('cards', changes);

    expect(result.acceptedIds).toEqual(['c1', 'c2']);
    const sent = JSON.parse(calls[0].init.body);
    expect(sent.changes).toHaveLength(2);
    expect(sent.collection).toBe('cards');
  });

  it('attaches a bearer token when getAuthToken is provided', async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({
      body: { changes: [], checkpoint: 1, acceptedIds: [] },
    }));
    const t = new HttpSyncTransport<CardFields>({
      baseUrl: 'https://edge.test',
      fetchImpl,
      getAuthToken: async () => 'tok-123',
    });

    await t.pull('boards', 0);

    expect(calls[0].init.headers.authorization).toBe('Bearer tok-123');
  });

  it('throws with the status and body on a non-2xx response', async () => {
    const { fetchImpl } = fakeFetch(() => ({
      ok: false,
      status: 409,
      body: { message: 'stale checkpoint' },
    }));
    const t = new HttpSyncTransport<CardFields>({
      baseUrl: 'https://edge.test',
      fetchImpl,
    });

    await expect(t.pull('cards', 0)).rejects.toThrow(/HTTP 409/);
  });

  it('rejects a malformed response body', async () => {
    const { fetchImpl } = fakeFetch(() => ({ body: { nope: true } }));
    const t = new HttpSyncTransport<CardFields>({
      baseUrl: 'https://edge.test',
      fetchImpl,
    });

    await expect(t.pull('cards', 0)).rejects.toThrow(/changes/);
  });
});
