import { getApiBaseUrl } from './config';
import { clearSession, getAccessToken } from './session';

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** When false, omit the Bearer token (login). Default true. */
  auth?: boolean;
}

/**
 * Typed JSON fetch against `VITE_API_URL`. Throws {@link ApiError} on non-2xx.
 */
export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const base = getApiBaseUrl();
  if (!base) {
    throw new Error('API mode is not configured (VITE_API_URL)');
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.auth !== false) {
    const token = getAccessToken();
    if (!token) {
      throw new ApiError('Not authenticated', 401, null);
    }
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${base}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    if (response.status === 401 && options.auth !== false) {
      clearSession();
    }
    const message =
      typeof parsed === 'object' &&
      parsed !== null &&
      'message' in parsed &&
      (typeof (parsed as { message: unknown }).message === 'string' ||
        Array.isArray((parsed as { message: unknown }).message))
        ? Array.isArray((parsed as { message: unknown }).message)
          ? ((parsed as { message: string[] }).message).join(', ')
          : (parsed as { message: string }).message
        : `Request failed (${response.status})`;
    throw new ApiError(message, response.status, parsed);
  }

  return parsed as T;
}
