import { ExecutionContext, CallHandler } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { of } from 'rxjs';
import { AppVersionInterceptor } from './app-version.interceptor';

describe('AppVersionInterceptor', () => {
  let interceptor: AppVersionInterceptor;
  let configService: ConfigService;

  const mockResponse = {
    setHeader: jest.fn(),
  };

  const mockContext = {
    switchToHttp: () => ({
      getResponse: () => mockResponse,
      getRequest: () => ({}),
    }),
  } as unknown as ExecutionContext;

  const mockNext: CallHandler = {
    handle: () => of({ data: 'test' }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should set X-Minimum-App-Version header with configured version', (done) => {
    configService = { get: jest.fn().mockReturnValue('2.1.0') } as unknown as ConfigService;
    interceptor = new AppVersionInterceptor(configService);

    interceptor.intercept(mockContext, mockNext).subscribe(() => {
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Minimum-App-Version', '2.1.0');
      done();
    });
  });

  it('should default to 1.0.0 when env var is not set', (done) => {
    configService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: string) => defaultValue),
    } as unknown as ConfigService;
    interceptor = new AppVersionInterceptor(configService);

    interceptor.intercept(mockContext, mockNext).subscribe(() => {
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Minimum-App-Version', '1.0.0');
      done();
    });
  });

  it('should not block the request handler', (done) => {
    configService = { get: jest.fn().mockReturnValue('1.0.0') } as unknown as ConfigService;
    interceptor = new AppVersionInterceptor(configService);

    interceptor.intercept(mockContext, mockNext).subscribe((result) => {
      expect(result).toEqual({ data: 'test' });
      done();
    });
  });
});
