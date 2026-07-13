import { BadRequestException, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Extracts and validates the active tenant's org id from the X-Org-Id
 * header. Every service method that touches tenant-scoped data takes this
 * as an explicit parameter rather than reading ambient/global state, so
 * queries can't accidentally run unscoped.
 */
export const ActiveOrgId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<Request>();
  const orgId = request.header('x-org-id');
  if (!orgId || !UUID_RE.test(orgId)) {
    throw new BadRequestException('A valid X-Org-Id header is required');
  }
  return orgId;
});
