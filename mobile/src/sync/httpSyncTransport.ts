import {
  CollectionName,
  PullResult,
  PushResult,
  RemoteChange,
  SyncTransport,
} from './ports';

/**
 * HTTP implementation of the {@link SyncTransport} port. It speaks to the
 * backend's field-level LWW endpoint (`POST {baseUrl}/sync`): the client posts
 * its change log (each field carrying its `<field>_updated_at` clock), the
 * server merges field-by-field against the PostgreSQL master, and returns the
 * fields where the server's copy is newer plus a fresh checkpoint.
 *
 * `fetch` is injected (defaulting to the global) so this is unit-testable in
 * Node with a fake, and so the app can pass a wrapped fetch (auth, tracing).
 * The port's two methods share one wire contract:
 *   request  { collection, sinceCheckpoint, changes }
 *   response { changes, checkpoint, acceptedIds }
 * `pull` sends an empty `changes` (download-only); `push` sends the pending
 * records and reads back the ids the server committed.
 */

export type FetchLike = (
  input: string,
  init: FetchInit,
) => Promise<FetchResponse>;

export interface FetchInit {
  method: string;
  headers: Record<string, string>;
  body: string;
  signal?: AbortSignal;
}

export interface FetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export interface HttpSyncConfig {
  /** Origin of the edge API, e.g. `https://edge.flowlogix.app`. No trailing `/`. */
  baseUrl: string;
  /** Injected fetch; defaults to the global `fetch`. */
  fetchImpl?: FetchLike;
  /** Returns a bearer token (or null) to authorise each request. */
  getAuthToken?: () => string | null | Promise<string | null>;
  /** Per-request timeout in ms (default 15_000). */
  timeoutMs?: number;
}

interface SyncRequestBody<F extends Record<string, unknown>> {
  collection: CollectionName;
  sinceCheckpoint: number;
  changes: RemoteChange<F>[];
}

interface SyncResponseBody<F extends Record<string, unknown>> {
  changes: RemoteChange<F>[];
  checkpoint: number;
  acceptedIds: string[];
}

export class HttpSyncTransport<F extends Record<string, unknown>>
  implements SyncTransport<F>
{
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(private readonly cfg: HttpSyncConfig) {
    const globalFetch = (
      globalThis as { fetch?: FetchLike }
    ).fetch;
    const impl = cfg.fetchImpl ?? globalFetch;
    if (!impl) {
      throw new Error(
        'HttpSyncTransport: no fetch available — pass cfg.fetchImpl',
      );
    }
    this.fetchImpl = impl;
    this.timeoutMs = cfg.timeoutMs ?? 15_000;
  }

  async pull(
    collection: CollectionName,
    sinceCheckpoint: number,
  ): Promise<PullResult<F>> {
    const res = await this.post({ collection, sinceCheckpoint, changes: [] });
    return { changes: res.changes, checkpoint: res.checkpoint };
  }

  async push(
    collection: CollectionName,
    changes: RemoteChange<F>[],
  ): Promise<PushResult> {
    // `sinceCheckpoint: 0` — a push is not asking for a delta window; the server
    // still merges each field by clock and reports which records it committed.
    const res = await this.post({ collection, sinceCheckpoint: 0, changes });
    return { acceptedIds: res.acceptedIds };
  }

  private async post(
    body: SyncRequestBody<F>,
  ): Promise<SyncResponseBody<F>> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json',
    };
    const token = this.cfg.getAuthToken
      ? await this.cfg.getAuthToken()
      : null;
    if (token) headers.authorization = `Bearer ${token}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: FetchResponse;
    try {
      res = await this.fetchImpl(`${this.cfg.baseUrl}/sync`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(
        `sync ${body.collection} failed: HTTP ${res.status}${
          detail ? ` — ${detail}` : ''
        }`,
      );
    }
    return this.parse(await res.json());
  }

  /** Validate the wire shape so a malformed payload fails loud, not silently. */
  private parse(raw: unknown): SyncResponseBody<F> {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error('sync response is not an object');
    }
    const obj = raw as Record<string, unknown>;
    if (!Array.isArray(obj.changes)) {
      throw new Error('sync response missing "changes" array');
    }
    if (typeof obj.checkpoint !== 'number') {
      throw new Error('sync response missing numeric "checkpoint"');
    }
    const acceptedIds = Array.isArray(obj.acceptedIds)
      ? obj.acceptedIds.filter((id): id is string => typeof id === 'string')
      : [];
    return {
      changes: obj.changes as RemoteChange<F>[],
      checkpoint: obj.checkpoint,
      acceptedIds,
    };
  }
}
