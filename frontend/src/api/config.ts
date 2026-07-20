/** Frontend API configuration — unset `VITE_API_URL` keeps the offline demo. */

export function getApiBaseUrl(): string | undefined {
  const raw = import.meta.env.VITE_API_URL?.trim();
  if (!raw) return undefined;
  return raw.replace(/\/$/, '');
}

/** True when the SPA should talk to the Nest API (JWT + board hydration). */
export function isApiMode(): boolean {
  return getApiBaseUrl() !== undefined;
}

export function getWsUrl(): string | undefined {
  const fromEnv = import.meta.env.VITE_WS_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  return getApiBaseUrl();
}
