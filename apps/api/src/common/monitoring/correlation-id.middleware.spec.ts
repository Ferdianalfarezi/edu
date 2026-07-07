import { CorrelationIdMiddleware } from './correlation-id.middleware';
import { MONITORING_CONFIG } from './monitoring.config';

describe('CorrelationIdMiddleware', () => {
  let middleware: CorrelationIdMiddleware;

  beforeEach(() => {
    middleware = new CorrelationIdMiddleware();
  });

  it('should generate a request ID when none provided', () => {
    const req: any = { headers: {} };
    const res: any = { setHeader: jest.fn() };
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(req['requestId']).toBeDefined();
    expect(req['requestId']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      MONITORING_CONFIG.requestTracking.headerName,
      req['requestId'],
    );
    expect(next).toHaveBeenCalled();
  });

  it('should reuse existing X-Request-ID from client', () => {
    const existingId = 'client-provided-id-123';
    const req: any = { headers: { 'x-request-id': existingId } };
    const res: any = { setHeader: jest.fn() };
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(req['requestId']).toBe(existingId);
    expect(res.setHeader).toHaveBeenCalledWith(
      MONITORING_CONFIG.requestTracking.headerName,
      existingId,
    );
    expect(next).toHaveBeenCalled();
  });

  it('should set the request ID in request headers', () => {
    const req: any = { headers: {} };
    const res: any = { setHeader: jest.fn() };
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(req.headers['x-request-id']).toBe(req['requestId']);
  });
});
