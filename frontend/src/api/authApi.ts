import { apiRequest } from './http';
import {
  AuthUserSession,
  setSession,
  clearSession,
  getAccessToken,
  getAuthUser,
} from './session';

interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    orgId: string;
    email: string;
    firstName: string;
    lastName: string;
  };
}

export async function login(
  email: string,
  password: string,
): Promise<AuthUserSession> {
  const result = await apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    auth: false,
    body: { email, password },
  });
  const session: AuthUserSession = {
    id: result.user.id,
    orgId: result.user.orgId,
    email: result.user.email,
    firstName: result.user.firstName,
    lastName: result.user.lastName,
  };
  setSession(result.accessToken, session);
  return session;
}

export async function fetchMe(): Promise<AuthUserSession> {
  const user = await apiRequest<{
    id: string;
    orgId: string;
    email: string;
    firstName: string;
    lastName: string;
  }>('/auth/me');
  const session: AuthUserSession = {
    id: user.id,
    orgId: user.orgId,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
  };
  const token = getAccessToken();
  if (token) setSession(token, session);
  return session;
}

export function logout(): void {
  clearSession();
}

export function readStoredSession(): AuthUserSession | null {
  if (!getAccessToken()) return null;
  return getAuthUser();
}
