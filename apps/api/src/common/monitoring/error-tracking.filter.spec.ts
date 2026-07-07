import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorTrackingFilter } from './error-tracking.filter';

describe('ErrorTrackingFilter', () => {
  let filter: ErrorTrackingFilter;
  let mockResponse: any;
  let mockRequest: any;
  let mockHost: any;

  beforeEach(() => {
    filter = new ErrorTrackingFilter();
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockRequest = {
      method: 'POST',
      url: '/api/v1/test',
      ip: '127.0.0.1',
      headers: { 'user-agent': 'jest', 'x-request-id': 'req-123' },
      user: { sub: 'user-1', tenant_id: 'tenant-1' },
      requestId: 'req-123',
    };
    mockHost = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
    };
  });

  it('should handle HttpException with structured response', () => {
    const exception = new HttpException('Not Found', HttpStatus.NOT_FOUND);

    filter.catch(exception, mockHost as any);

    expect(mockResponse.status).toHaveBeenCalledWith(404);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        requestId: 'req-123',
        path: '/api/v1/test',
      }),
    );
  });

  it('should handle HttpException with object response body', () => {
    const exception = new HttpException(
      { message: ['field is required'], error: 'Bad Request', statusCode: 400 },
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, mockHost as any);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    const jsonArg = mockResponse.json.mock.calls[0][0];
    expect(jsonArg.message).toEqual(['field is required']);
    expect(jsonArg.error).toBe('Bad Request');
  });

  it('should handle generic Error as 500', () => {
    const exception = new Error('Something broke');

    filter.catch(exception, mockHost as any);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        message: 'Internal server error',
        error: 'InternalServerError',
        requestId: 'req-123',
      }),
    );
  });

  it('should handle unknown exception type as 500', () => {
    filter.catch('string error', mockHost as any);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        error: 'UnknownError',
      }),
    );
  });

  it('should include timestamp in error response', () => {
    const exception = new HttpException('Test', 400);

    filter.catch(exception, mockHost as any);

    const jsonArg = mockResponse.json.mock.calls[0][0];
    expect(jsonArg.timestamp).toBeDefined();
    expect(new Date(jsonArg.timestamp).getTime()).not.toBeNaN();
  });

  it('should log 5xx errors with error level', () => {
    const errorSpy = jest.spyOn((filter as any).logger, 'error');
    const exception = new Error('DB connection lost');

    filter.catch(exception, mockHost as any);

    expect(errorSpy).toHaveBeenCalled();
  });

  it('should log 4xx errors with warn level', () => {
    const warnSpy = jest.spyOn((filter as any).logger, 'warn');
    const exception = new HttpException('Forbidden', 403);

    filter.catch(exception, mockHost as any);

    expect(warnSpy).toHaveBeenCalled();
  });
});
