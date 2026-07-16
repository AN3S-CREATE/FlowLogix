import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route (or whole controller) as reachable without a JWT — the global
 * `JwtAuthGuard` skips it. Used for `POST /auth/login` and the health/metrics
 * endpoints that monitoring scrapes unauthenticated.
 */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);
