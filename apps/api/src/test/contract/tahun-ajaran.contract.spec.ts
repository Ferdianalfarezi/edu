import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { TahunAjaranController } from '@/modules/tahun-ajaran/tahun-ajaran.controller';
import { TahunAjaranService } from '@/modules/tahun-ajaran/tahun-ajaran.service';
import { KelasService } from '@/modules/kelas/kelas.service';
import { createMockTestApp, MockProviders } from './helpers/test-app.factory';
import { adminToken } from './helpers/auth.helper';
import { expectApiError, expectObjectWithFields, expectUUID } from './helpers/schema-validators';

describe('Tahun Ajaran Contract Tests', () => {
  let app: INestApplication;
  let mockTahunAjaranService: Record<string, jest.Mock>;

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
    mockTahunAjaranService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      activate: jest.fn(),
    };

    const mockKelasService = {
      createKelas: jest.fn(),
      listKelas: jest.fn(),
      getKelasById: jest.fn(),
      updateKelas: jest.fn(),
      deleteKelas: jest.fn(),
      duplicateClassStructure: jest.fn(),
      countByTahunAjaran: jest.fn(),
    };

    const mocks: MockProviders = {
      db: mockDb,
      redis: mockRedis,
      serviceOverrides: [
        { provide: TahunAjaranService, useValue: mockTahunAjaranService },
        { provide: KelasService, useValue: mockKelasService },
      ],
    };

    app = await createMockTestApp(
      [TahunAjaranController],
      [TahunAjaranService, KelasService],
      mocks,
    );
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── GET /api/v1/tahun-ajaran ───────────────────────────────────

  describe('GET /api/v1/tahun-ajaran', () => {
    it('should return array of tahun ajaran with expected shape', async () => {
      mockTahunAjaranService.findAll.mockResolvedValue([
        {
          id: '660e8400-e29b-41d4-a716-446655440001',
          nama: '2024/2025',
          status: 'aktif',
          tanggalMulai: '2024-07-01',
          tanggalSelesai: '2025-06-30',
          tenantId: '770e8400-e29b-41d4-a716-446655440001',
          createdAt: new Date().toISOString(),
        },
      ]);

      const res = await request(app.getHttpServer())
        .get('/api/v1/tahun-ajaran')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);

      const item = res.body[0];
      expectObjectWithFields(item, ['id', 'nama', 'status']);
      expect(typeof item.id).toBe('string');
      expect(typeof item.nama).toBe('string');
      expect(typeof item.status).toBe('string');
    });

    it('should return 401 when no auth token is provided', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/tahun-ajaran').expect(401);

      expectApiError(res.body, 401);
    });
  });

  // ─── GET /api/v1/tahun-ajaran/:id ──────────────────────────────

  describe('GET /api/v1/tahun-ajaran/:id', () => {
    it('should return single tahun ajaran object shape', async () => {
      const taId = '660e8400-e29b-41d4-a716-446655440001';
      mockTahunAjaranService.findOne.mockResolvedValue({
        id: taId,
        nama: '2024/2025',
        status: 'aktif',
        tanggalMulai: '2024-07-01',
        tanggalSelesai: '2025-06-30',
        tenantId: '770e8400-e29b-41d4-a716-446655440001',
        createdAt: new Date().toISOString(),
        kelasCount: 6,
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/tahun-ajaran/${taId}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expectObjectWithFields(res.body, ['id', 'nama', 'status']);
      expectUUID(res.body.id);
      expect(typeof res.body.nama).toBe('string');
      expect(typeof res.body.status).toBe('string');
    });

    it('should return 401 when no auth token is provided', async () => {
      const taId = '660e8400-e29b-41d4-a716-446655440001';
      const res = await request(app.getHttpServer())
        .get(`/api/v1/tahun-ajaran/${taId}`)
        .expect(401);

      expectApiError(res.body, 401);
    });

    it('should return 404 when tahun ajaran not found', async () => {
      const taId = '660e8400-e29b-41d4-a716-446655440099';
      mockTahunAjaranService.findOne.mockRejectedValue(
        new (require('@nestjs/common').NotFoundException)(
          `Tahun ajaran dengan id ${taId} tidak ditemukan`,
        ),
      );

      const res = await request(app.getHttpServer())
        .get(`/api/v1/tahun-ajaran/${taId}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(404);

      expectApiError(res.body, 404);
    });
  });

  // ─── POST /api/v1/tahun-ajaran ─────────────────────────────────

  describe('POST /api/v1/tahun-ajaran', () => {
    it('should return created tahun ajaran shape on success', async () => {
      mockTahunAjaranService.create.mockResolvedValue({
        id: '660e8400-e29b-41d4-a716-446655440002',
        nama: '2025/2026',
        status: 'disiapkan',
        tanggalMulai: '2025-07-01',
        tanggalSelesai: '2026-06-30',
        tenantId: '770e8400-e29b-41d4-a716-446655440001',
        createdAt: new Date().toISOString(),
        duplicatedClassCount: 6,
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/tahun-ajaran')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          nama: '2025/2026',
          tanggal_mulai: '2025-07-01',
          tanggal_selesai: '2026-06-30',
        })
        .expect(201);

      expectObjectWithFields(res.body, ['id', 'nama', 'status']);
      expectUUID(res.body.id);
      expect(res.body.nama).toBe('2025/2026');
      expect(res.body.status).toBe('disiapkan');
    });

    it('should return 400 when required fields are missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/tahun-ajaran')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({})
        .expect(400);

      expect(res.body).toHaveProperty('statusCode', 400);
      expect(res.body).toHaveProperty('message');
    });

    it('should return 400 when tanggal_mulai is not a valid date string', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/tahun-ajaran')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          nama: '2025/2026',
          tanggal_mulai: 'not-a-date',
          tanggal_selesai: '2026-06-30',
        })
        .expect(400);

      expect(res.body).toHaveProperty('statusCode', 400);
      expect(res.body).toHaveProperty('message');
    });

    it('should return 401 when no auth token is provided', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/tahun-ajaran')
        .send({
          nama: '2025/2026',
          tanggal_mulai: '2025-07-01',
          tanggal_selesai: '2026-06-30',
        })
        .expect(401);

      expectApiError(res.body, 401);
    });
  });

  // ─── PATCH /api/v1/tahun-ajaran/:id/activate ───────────────────

  describe('PATCH /api/v1/tahun-ajaran/:id/activate', () => {
    it('should return activation result shape on success', async () => {
      const taId = '660e8400-e29b-41d4-a716-446655440002';
      mockTahunAjaranService.activate.mockResolvedValue({
        id: taId,
        nama: '2025/2026',
        status: 'aktif',
        previousActiveId: '660e8400-e29b-41d4-a716-446655440001',
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/tahun-ajaran/${taId}/activate`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expectObjectWithFields(res.body, ['id', 'nama', 'status']);
      expect(res.body.status).toBe('aktif');
    });

    it('should return 401 when no auth token is provided', async () => {
      const taId = '660e8400-e29b-41d4-a716-446655440002';
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/tahun-ajaran/${taId}/activate`)
        .expect(401);

      expectApiError(res.body, 401);
    });
  });
});
