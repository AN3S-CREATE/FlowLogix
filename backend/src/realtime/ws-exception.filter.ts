import { ArgumentsHost, Catch, Logger } from '@nestjs/common';
import { BaseWsExceptionFilter } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { WS_EVENTS } from './realtime.constants';

/**
 * Keeps a bad frame from taking down the socket: any error thrown in a gateway
 * handler is caught, logged, and reported back to just the offending client as
 * a structured `board:error` event (rather than the default disconnect).
 */
@Catch()
export class WsExceptionFilter extends BaseWsExceptionFilter {
  private readonly logger = new Logger(WsExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const client = host.switchToWs().getClient<Socket>();
    const message =
      exception instanceof Error ? exception.message : 'Unexpected error';
    this.logger.warn(`WS handler error: ${message}`);
    if (client && typeof client.emit === 'function') {
      client.emit(WS_EVENTS.ERROR, { message });
    }
  }
}
