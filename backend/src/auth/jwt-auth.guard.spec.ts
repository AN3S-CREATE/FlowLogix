import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';

function ctx(
  opts: {
    type?: string;
    authHeader?: string;
  } = {},
): { context: ExecutionContext; request: { user?: unknown } } {
  const request: { user?: unknown; header: (n: string) => string | undefined } =
    {
      header: (n: string) =>
        n.toLowerCase() === 'authorization' ? opts.authHeader : undefined,
    };
  const context = {
    getType: () => opts.type ?? 'http',
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

function makeGuard(isPublic: boolean, verify: jest.Mock): JwtAuthGuard {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(isPublic),
  } as unknown as Reflector;
  const jwt = { verifyAsync: verify } as unknown as JwtService;
  return new JwtAuthGuard(reflector, jwt);
}

describe('JwtAuthGuard', () => {
  it('allows a @Public() route without a token', async () => {
    const guard = makeGuard(true, jest.fn());
    const { context } = ctx({});
    expect(await guard.canActivate(context)).toBe(true);
  });

  it('lets non-HTTP contexts (websockets) pass through', async () => {
    const guard = makeGuard(false, jest.fn());
    const { context } = ctx({ type: 'ws' });
    expect(await guard.canActivate(context)).toBe(true);
  });

  it('verifies the bearer token and attaches the principal', async () => {
    const verify = jest.fn().mockResolvedValue({
      sub: 'user-1',
      orgId: 'org-1',
      email: 'a@x.co',
    });
    const guard = makeGuard(false, verify);
    const { context, request } = ctx({ authHeader: 'Bearer good.token' });

    expect(await guard.canActivate(context)).toBe(true);
    expect(verify).toHaveBeenCalledWith('good.token');
    expect(request.user).toEqual({
      userId: 'user-1',
      orgId: 'org-1',
      email: 'a@x.co',
    });
  });

  it('rejects a missing token', async () => {
    const guard = makeGuard(false, jest.fn());
    const { context } = ctx({});
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an invalid/expired token', async () => {
    const verify = jest.fn().mockRejectedValue(new Error('expired'));
    const guard = makeGuard(false, verify);
    const { context } = ctx({ authHeader: 'Bearer bad.token' });
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
