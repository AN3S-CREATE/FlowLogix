import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { AuthUser, JwtPayload } from './auth-user';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * Global guard: every HTTP route requires a valid `Authorization: Bearer <jwt>`
 * unless marked `@Public()`. On success it attaches the verified principal to
 * `request.user`, which is the *only* place `ActiveOrgId` now trusts for the
 * tenant id — so a client can no longer spoof another org via a header.
 *
 * Non-HTTP contexts (the Socket.io gateway) pass through untouched; the gateway
 * runs its own handshake/ownership check.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const token = this.bearerToken(request);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    request.user = {
      userId: payload.sub,
      orgId: payload.orgId,
      email: payload.email,
    };
    return true;
  }

  private bearerToken(request: Request): string | null {
    const header = request.header('authorization');
    if (!header) return null;
    // Tolerate arbitrary whitespace between the scheme and the token.
    const [scheme, value] = header.trim().split(/\s+/);
    return scheme?.toLowerCase() === 'bearer' && value ? value : null;
  }
}
