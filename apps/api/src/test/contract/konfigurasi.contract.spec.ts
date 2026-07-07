import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { KonfigurasiController } from '@/modules/konfigurasi/konfigurasi.controller';
import { KonfigurasiService } from '@/modules/konfigurasi/konfigurasi.service';
import { createMockTestApp, MockProviders } from './helpers/test-app.factory';
import { adminToken, kepalaSekolahToken, guruToken } from './helpers/auth.helper';
import { expectApiError, expectObjectWithFields } from './helpers/schema-validators';

/**
 * Validates 400 validation error shape from NestJS ValidationPipe.
 */
function expectValidationError(body: any) {
  expect(body).toHaveProperty('statusCode', 400);
  expect(body).toHaveProperty('message');
  if (Array.isArray(body.message)) {
    expect(body.message.length).toBeGreaterThan(0);
    body.message.forEach((msg: any) => expect(typeof msg).toBe('string'));
  } else {
    expect(typeof body.message).toBe('string');
  }
}

/**
 * Validates a single KonfigurasiItem shape: { key, value }
 */
function expectKonfigurasiItem(item: any) {
  expect(item).toHaveProperty('key');
  expect(typeof item.key).toBe('string');
  expect(item).toHaveProperty('value');
  // value can be any type (object, string, number, etc.)
  expect(item.value).toBeDefined();
}

describe('Konfigurasi Contract Tests', () => {
  let app: INestApplication;
  let mockKonfigurasiService: Record<string, jest.Mock>;

  const mockDb = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue([]),
  };

  const mockRedis = {
    exists: jest.fn().mockResolvedValue(0),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    quit: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    mockKonfigurasiService = {
      getAllConfig: jest.fn(),
      getConfigByKey: jest.fn(),
      upsertConfig: jest.fn(),
      bulkUpsertConfig: jest.fn(),
      getHariLibur: jest.fn(),
      createHariLibur: jest.fn(),
      deleteHariLibur: jest.fn(),
    };

    const mocks: MockProviders = {
      db: mockDb,
      redis: mockRedis,
      serviceOverrides: [{ provide: KonfigurasiService, useValue: mockKonfigurasiService }],
    };

    app = await createMockTestApp([KonfigurasiController], [KonfigurasiService], mocks);
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── GET /api/v1/konfigurasi ────────────────────────────────────

  describe('GET /api/v1/konfigurasi', () => {
    it('should return KonfigurasiItem[] array directly (not wrapped in data)', async () => {
      mockKonfigurasiService.getAllConfig.mockResolvedValue([
        { key: 'threshold_alpa', value: { value: 10 } },
        { key: 'nominal_spp', value: { tingkat_1: 250000, tingkat_2: 275000 } },
        { key: 'tanggal_jatuh_tempo', value: { hari: 10 } },
      ]);

      const res = await request(app.getHttpServer())
        .get('/api/v1/konfigurasi')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      // Response is a direct array, NOT wrapped in { data: [...] }
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);

      res.body.forEach(expectKonfigurasiItem);
    });

    it('should also allow KEPALA_SEKOLAH role', async () => {
      mockKonfigurasiService.getAllConfig.mockResolvedValue([
        { key: 'threshold_alpa', value: { value: 10 } },
      ]);

      const res = await request(app.getHttpServer())
        .get('/api/v1/konfigurasi')
        .set('Authorization', `Bearer ${kepalaSekolahToken()}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should return 401 when no auth token is provided', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/konfigurasi').expect(401);

      expectApiError(res.body, 401);
    });

    it('should return 403 when non-admin/kepala_sekolah role accesses', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/konfigurasi')
        .set('Authorization', `Bearer ${guruToken()}`)
        .expect(403);

      expectApiError(res.body, 403);
    });
  });

  // ─── GET /api/v1/konfigurasi/:key ──────────────────────────────

  describe('GET /api/v1/konfigurasi/:key', () => {
    it('should return single KonfigurasiItem shape', async () => {
      mockKonfigurasiService.getConfigByKey.mockResolvedValue({
        key: 'threshold_alpa',
        value: { value: 10 },
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/konfigurasi/threshold_alpa')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expectKonfigurasiItem(res.body);
      expect(res.body.key).toBe('threshold_alpa');
    });

    it('should return 404 when key not found', async () => {
      mockKonfigurasiService.getConfigByKey.mockRejectedValue(
        new (require('@nestjs/common').NotFoundException)(
          "Konfigurasi dengan key 'nonexistent' tidak ditemukan",
        ),
      );

      const res = await request(app.getHttpServer())
        .get('/api/v1/konfigurasi/nonexistent')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(404);

      expectApiError(res.body, 404);
    });

    it('should return 401 when no auth token is provided', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/konfigurasi/threshold_alpa')
        .expect(401);

      expectApiError(res.body, 401);
    });
  });

  // ─── PUT /api/v1/konfigurasi/:key ──────────────────────────────

  describe('PUT /api/v1/konfigurasi/:key', () => {
    it('should return updated KonfigurasiItem shape', async () => {
      mockKonfigurasiService.upsertConfig.mockResolvedValue({
        key: 'threshold_alpa',
        value: { value: 15 },
      });

      const res = await request(app.getHttpServer())
        .put('/api/v1/konfigurasi/threshold_alpa')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ value: { value: 15 } })
        .expect(200);

      expectKonfigurasiItem(res.body);
      expect(res.body.key).toBe('threshold_alpa');
    });

    it('should return 400 when value is missing from body', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/konfigurasi/threshold_alpa')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({})
        .expect(400);

      expectValidationError(res.body);
    });

    it('should return 401 when no auth token is provided', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/konfigurasi/threshold_alpa')
        .send({ value: { value: 15 } })
        .expect(401);

      expectApiError(res.body, 401);
    });
  });

  // ─── PATCH /api/v1/konfigurasi ─────────────────────────────────

  describe('PATCH /api/v1/konfigurasi', () => {
    it('should return KonfigurasiItem[] array on bulk upsert', async () => {
      mockKonfigurasiService.bulkUpsertConfig.mockResolvedValue([
        { key: 'threshold_alpa', value: { value: 12 } },
        { key: 'tanggal_jatuh_tempo', value: { hari: 15 } },
      ]);

      const res = await request(app.getHttpServer())
        .patch('/api/v1/konfigurasi')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          items: [
            { key: 'threshold_alpa', value: { value: 12 } },
            { key: 'tanggal_jatuh_tempo', value: { hari: 15 } },
          ],
        })
        .expect(200);

      // Response is a direct array
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
      res.body.forEach(expectKonfigurasiItem);
    });

    it('should return 400 when items is not an array', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/konfigurasi')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ items: 'not-an-array' })
        .expect(400);

      expectValidationError(res.body);
    });

    it('should return 400 when body is empty', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/konfigurasi')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({})
        .expect(400);

      expectValidationError(res.body);
    });

    it('should return 401 when no auth token is provided', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/konfigurasi')
        .send({
          items: [{ key: 'threshold_alpa', value: { value: 12 } }],
        })
        .expect(401);

      expectApiError(res.body, 401);
    });
  });
});
