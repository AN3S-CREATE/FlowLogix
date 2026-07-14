import { ArgumentsHost, Catch, HttpException, Logger } from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { WS_EVENTS } from './realtime.constants';

/**
 * Keeps a bad frame from taking down the socket: any error thrown in a gateway
 * handler is caught, logged, and reported back to just the offending client as
 * a structured `board:error` event (rather than the default disconnect).
 *
 * Only messages from exceptions we deliberately throw (`WsException`,
 * `HttpException`) are surfaced to the client; anything else — a DB failure, a
 * bug — is masked behind a generic message so we never leak schema, SQL, or
 * stack details over the socket. The full error is still logged server-side.
 */
@Catch()
export class WsExceptionFilter extends BaseWsExceptionFilter {
  private readonly logger = new Logger(WsExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const client = host.switchToWs().getClient<Socket>();
    const clientMessage = this.safeMessage(exception);

    // Log the real error (whatever it is) but only ever emit the safe message.
    this.logger.warn(
      `WS handler error: ${
        exception instanceof Error ? exception.message : String(exception)
      }`,
    );
    if (client && typeof client.emit === 'function') {
      client.emit(WS_EVENTS.ERROR, { message: clientMessage });
    }
  }

  private safeMessage(exception: unknown): string {
    if (exception instanceof WsException) {
      return exception.message;
    }
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'string') return response;
      const message = (response as { message?: unknown }).message;
      if (typeof message === 'string') return message;
      if (Array.isArray(message)) return message.join(', ');
      return exception.message;
    }
    return 'Unexpected error';
  }
}
