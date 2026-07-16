import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { AuthUser } from './auth-user';

/**
 * Injects the authenticated {@link AuthUser} (set by `JwtAuthGuard` from the
 * verified token). Only valid on JWT-protected routes.
 */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    return request.user as AuthUser;
  },
);
