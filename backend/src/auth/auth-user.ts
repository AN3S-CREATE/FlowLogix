/** The authenticated principal, derived from a verified JWT and attached to the request. */
export interface AuthUser {
  userId: string;
  orgId: string;
  email: string;
}

/** JWT payload shape signed at login. */
export interface JwtPayload {
  /** Subject: the user id. */
  sub: string;
  orgId: string;
  email: string;
}
