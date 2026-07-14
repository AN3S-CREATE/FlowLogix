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

    // Expected exceptions (bad input, auth) are just warnings; anything else is
    // an unexpected runtime error — log it at error level with the full stack so
    // it's diagnosable in production. Either way, only the safe message is emitted.
    if (this.isExpected(exception)) {
      this.logger.warn(`WS handler error: ${clientMessage}`);
    } else {
      this.logger.error(
        `Unexpected WS handler error: ${
          exception instanceof Error ? exception.message : String(exception)
        }`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }
    if (client && typeof client.emit === 'function') {
      client.emit(WS_EVENTS.ERROR, { message: clientMessage });
    }
  }

  private isExpected(exception: unknown): boolean {
    return (
      exception instanceof WsException || exception instanceof HttpException
    );
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
