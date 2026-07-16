import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthUser } from '../../auth/auth-user';

/**
 * Extracts the active tenant's org id from the **authenticated principal**
 * (`request.user`, populated by `JwtAuthGuard` from the verified JWT) — never
 * from a client-supplied header, which would be spoofable. Every service method
 * that touches tenant-scoped data takes this as an explicit parameter rather
 * than reading ambient state, so queries can't accidentally run unscoped.
 */
export const ActiveOrgId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const orgId = request.user?.orgId;
    if (!orgId) {
      throw new UnauthorizedException('Authentication required');
    }
    return orgId;
  },
);
