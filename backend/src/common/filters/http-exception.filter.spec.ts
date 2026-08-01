import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

type MockResponse = {
  status: jest.Mock;
  json: jest.Mock;
};

function mockHost(
  response: MockResponse,
  request: { method: string; url: string } = {
    method: 'GET',
    url: '/boards',
  },
): ArgumentsHost {
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
}

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let response: MockResponse;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  it('forwards HttpException status and message with path + timestamp', () => {
    filter.catch(
      new HttpException('Not found', HttpStatus.NOT_FOUND),
      mockHost(response),
    );

    expect(response.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Not found',
        path: '/boards',
        timestamp: expect.any(String),
      }),
    );
  });

  it('preserves ValidationPipe-style object payloads', () => {
    filter.catch(
      new HttpException(
        {
          statusCode: 400,
          message: ['email must be an email'],
          error: 'Bad Request',
        },
        HttpStatus.BAD_REQUEST,
      ),
      mockHost(response, { method: 'POST', url: '/auth/login' }),
    );

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: ['email must be an email'],
        error: 'Bad Request',
        path: '/auth/login',
      }),
    );
  });

  it('masks unexpected errors as a generic 500', () => {
    filter.catch(
      new Error('relation "secret" does not exist'),
      mockHost(response),
    );

    expect(response.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
        path: '/boards',
      }),
    );
    const body = response.json.mock.calls[0][0] as Record<string, unknown>;
    expect(JSON.stringify(body)).not.toContain('secret');
  });

  it('ignores non-HTTP contexts (e.g. websockets)', () => {
    const host = {
      getType: () => 'ws',
      switchToHttp: jest.fn(),
    } as unknown as ArgumentsHost;

    filter.catch(new Error('boom'), host);

    expect(host.switchToHttp).not.toHaveBeenCalled();
    expect(response.status).not.toHaveBeenCalled();
  });
});
