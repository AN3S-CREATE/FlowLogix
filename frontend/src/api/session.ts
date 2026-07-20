const TOKEN_KEY = 'flowlogix.accessToken';
const USER_KEY = 'flowlogix.authUser';

export interface AuthUserSession {
  id: string;
  orgId: string;
  email: string;
  firstName: string;
  lastName: string;
}

function storage(): Storage | null {
  try {
    if (typeof sessionStorage !== 'undefined') return sessionStorage;
  } catch {
    // private mode / blocked storage
  }
  return null;
}

export function getAccessToken(): string | null {
  return storage()?.getItem(TOKEN_KEY) ?? null;
}

export function getAuthUser(): AuthUserSession | null {
  const raw = storage()?.getItem(USER_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'id' in parsed &&
      'orgId' in parsed &&
      'email' in parsed &&
      'firstName' in parsed &&
      'lastName' in parsed
    ) {
      const u = parsed as AuthUserSession;
      if (
        typeof u.id === 'string' &&
        typeof u.orgId === 'string' &&
        typeof u.email === 'string' &&
        typeof u.firstName === 'string' &&
        typeof u.lastName === 'string'
      ) {
        return u;
      }
    }
  } catch {
    // corrupt session
  }
  return null;
}

export function setSession(token: string, user: AuthUserSession): void {
  const s = storage();
  if (!s) return;
  s.setItem(TOKEN_KEY, token);
  s.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  const s = storage();
  if (!s) return;
  s.removeItem(TOKEN_KEY);
  s.removeItem(USER_KEY);
}
