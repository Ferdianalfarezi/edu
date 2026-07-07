import { RedisService } from './redis.service';

describe('RedisService', () => {
  let service: RedisService;
  let mockRedis: Record<string, jest.Mock>;

  beforeEach(() => {
    mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      exists: jest.fn(),
      incr: jest.fn(),
      expire: jest.fn(),
      quit: jest.fn().mockResolvedValue(undefined),
    };
    service = new RedisService(mockRedis as any);
  });

  describe('cache operations', () => {
    it('get() returns cached value', async () => {
      mockRedis.get.mockResolvedValue('cached');
      expect(await service.get('key')).toBe('cached');
      expect(mockRedis.get).toHaveBeenCalledWith('key');
    });

    it('get() returns null for missing key', async () => {
      mockRedis.get.mockResolvedValue(null);
      expect(await service.get('missing')).toBeNull();
    });

    it('set() stores value without TTL', async () => {
      await service.set('key', 'value');
      expect(mockRedis.set).toHaveBeenCalledWith('key', 'value');
    });

    it('set() stores value with TTL', async () => {
      await service.set('key', 'value', 300);
      expect(mockRedis.set).toHaveBeenCalledWith('key', 'value', 'EX', 300);
    });

    it('del() removes a key', async () => {
      await service.del('key');
      expect(mockRedis.del).toHaveBeenCalledWith('key');
    });

    it('exists() returns true when key exists', async () => {
      mockRedis.exists.mockResolvedValue(1);
      expect(await service.exists('key')).toBe(true);
    });

    it('exists() returns false when key missing', async () => {
      mockRedis.exists.mockResolvedValue(0);
      expect(await service.exists('missing')).toBe(false);
    });
  });

  describe('token blacklist operations', () => {
    it('blacklistToken() sets key with prefix and TTL', async () => {
      await service.blacklistToken('jti-123', 3600);
      expect(mockRedis.set).toHaveBeenCalledWith('blacklist:jti-123', '1', 'EX', 3600);
    });

    it('isTokenBlacklisted() returns true for blacklisted token', async () => {
      mockRedis.exists.mockResolvedValue(1);
      expect(await service.isTokenBlacklisted('jti-123')).toBe(true);
      expect(mockRedis.exists).toHaveBeenCalledWith('blacklist:jti-123');
    });

    it('isTokenBlacklisted() returns false for non-blacklisted token', async () => {
      mockRedis.exists.mockResolvedValue(0);
      expect(await service.isTokenBlacklisted('jti-456')).toBe(false);
    });
  });

  describe('distributed lock operations', () => {
    it('acquireLock() returns true when lock acquired', async () => {
      mockRedis.set.mockResolvedValue('OK');
      const result = await service.acquireLock('billing-gen:t1', 300);
      expect(result).toBe(true);
      expect(mockRedis.set).toHaveBeenCalledWith('lock:billing-gen:t1', '1', 'EX', 300, 'NX');
    });

    it('acquireLock() returns false when lock already held', async () => {
      mockRedis.set.mockResolvedValue(null);
      const result = await service.acquireLock('billing-gen:t1', 300);
      expect(result).toBe(false);
    });

    it('releaseLock() deletes the lock key', async () => {
      await service.releaseLock('billing-gen:t1');
      expect(mockRedis.del).toHaveBeenCalledWith('lock:billing-gen:t1');
    });
  });

  describe('counter operations', () => {
    it('increment() increments and sets TTL on first call', async () => {
      mockRedis.incr.mockResolvedValue(1);
      const count = await service.increment('rate:phone:123', 3600);
      expect(count).toBe(1);
      expect(mockRedis.incr).toHaveBeenCalledWith('rate:phone:123');
      expect(mockRedis.expire).toHaveBeenCalledWith('rate:phone:123', 3600);
    });

    it('increment() does not reset TTL on subsequent calls', async () => {
      mockRedis.incr.mockResolvedValue(3);
      const count = await service.increment('rate:phone:123', 3600);
      expect(count).toBe(3);
      expect(mockRedis.expire).not.toHaveBeenCalled();
    });

    it('increment() without TTL does not set expiry', async () => {
      mockRedis.incr.mockResolvedValue(1);
      await service.increment('counter:total');
      expect(mockRedis.expire).not.toHaveBeenCalled();
    });
  });

  describe('lifecycle', () => {
    it('onModuleDestroy() quits the redis connection', async () => {
      await service.onModuleDestroy();
      expect(mockRedis.quit).toHaveBeenCalled();
    });
  });

  describe('getClient()', () => {
    it('returns the raw redis client', () => {
      expect(service.getClient()).toBe(mockRedis);
    });
  });
});
