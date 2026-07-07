import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { LoggingInterceptor } from './logging.interceptor';

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;

  beforeEach(() => {
    interceptor = new LoggingInterceptor();
  });

  function createMockContext(overrides?: any): ExecutionContext {
    const request = {
      method: 'GET',
      url: '/api/v1/test',
      ip: '127.0.0.1',
      headers: { 'user-agent': 'jest-test', 'x-request-id': 'test-req-id' },
      user: { sub: 'user-123', tenant_id: 'tenant-456' },
      requestId: 'test-req-id',
      ...overrides?.request,
    };
    const response = {
      statusCode: 200,
      ...overrides?.response,
    };

    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;
  }

  it('should log successful requests with timing', (done) => {
    const context = createMockContext();
    const handler: CallHandler = { handle: () => of({ data: 'test' }) };
    const logSpy = jest.spyOn((interceptor as any).logger, 'log');

    interceptor.intercept(context, handler).subscribe({
      complete: () => {
        expect(logSpy).toHaveBeenCalled();
        const logArg = logSpy.mock.calls[0][0] as any;
        expect(logArg).toMatchObject({
          method: 'GET',
          url: '/api/v1/test',
          statusCode: 200,
          requestId: 'test-req-id',
          userId: 'user-123',
          tenantId: 'tenant-456',
        });
        expect(logArg.durationMs).toBeGreaterThanOrEqual(0);
        done();
      },
    });
  });

  it('should log error responses with timing', (done) => {
    const context = createMockContext();
    const error = { status: 404, name: 'NotFoundException', message: 'Not found' };
    const handler: CallHandler = { handle: () => throwError(() => error) };
    const errorSpy = jest.spyOn((interceptor as any).logger, 'error');

    interceptor.intercept(context, handler).subscribe({
      error: () => {
        expect(errorSpy).toHaveBeenCalled();
        const logArg = errorSpy.mock.calls[0][0] as any;
        expect(logArg).toMatchObject({
          method: 'GET',
          url: '/api/v1/test',
          statusCode: 404,
          requestId: 'test-req-id',
          error: { name: 'NotFoundException', message: 'Not found' },
        });
        expect(logArg.durationMs).toBeGreaterThanOrEqual(0);
        done();
      },
    });
  });

  it('should default userId to anonymous when no user', (done) => {
    const context = createMockContext({ request: { user: undefined } });
    const handler: CallHandler = { handle: () => of(null) };
    const logSpy = jest.spyOn((interceptor as any).logger, 'log');

    interceptor.intercept(context, handler).subscribe({
      complete: () => {
        const logArg = logSpy.mock.calls[0][0] as any;
        expect(logArg.userId).toBe('anonymous');
        expect(logArg.tenantId).toBeNull();
        done();
      },
    });
  });
});
