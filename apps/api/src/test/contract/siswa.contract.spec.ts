import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { SiswaController } from '@/modules/siswa/siswa.controller';
import { SiswaService } from '@/modules/siswa/siswa.service';
import { RolesGuard } from '@/common/guards/roles.guard';
import { createMockTestApp, MockProviders } from './helpers/test-app.factory';
import { adminToken } from './helpers/auth.helper';
import {
  expectPaginatedResponse,
  expectApiError,
  expectObjectWithFields,
  expectUUID,
} from './helpers/schema-validators';

/**
 * Siswa Module Contract Tests
 *
 * Validates that API response shapes match what the Vue admin frontend expects.
 * Uses mocked SiswaService — no DB or Redis hits.
 */
describe('Siswa Contract Tests', () => {
  let app: INestApplication;
  let mockSiswaService: Record<string, jest.Mock>;

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
    mockSiswaService = {
      createSiswa: jest.fn(),
      listSiswa: jest.fn(),
      getSiswaById: jest.fn(),
      updateSiswa: jest.fn(),
      softDeleteSiswa: jest.fn(),
      importCsvPreview: jest.fn(),
      importCsvExecute: jest.fn(),
      bulkImportSiswa: jest.fn(),
    };

    const mocks: MockProviders = {
      db: mockDb,
      redis: mockRedis,
      serviceOverrides: [{ provide: SiswaService, useValue: mockSiswaService }],
    };

    app = await createMockTestApp([SiswaController], [SiswaService, RolesGuard], mocks);
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── GET /api/v1/siswa — paginated response shape ─────────────

  describe('GET /api/v1/siswa', () => {
    it('should return paginated list shape with siswa items', async () => {
      mockSiswaService.listSiswa.mockResolvedValue({
        data: [
          {
            id: '550e8400-e29b-41d4-a716-446655440001',
            kelasId: '660e8400-e29b-41d4-a716-446655440001',
            nama: 'Budi Santoso',
            nisn: '0012345678',
            jenisKelamin: 'L',
            tanggalLahir: '2010-05-15',
            orangTuaId: '770e8400-e29b-41d4-a716-446655440001',
            status: 'aktif',
            createdAt: new Date().toISOString(),
          },
        ],
        nextCursor: null,
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/siswa')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      // Validate the response has data array
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);

      // Validate siswa item shape
      const item = res.body.data[0];
      expectObjectWithFields(item, ['id', 'nama', 'status']);
      expect(typeof item.id).toBe('string');
      expect(typeof item.nama).toBe('string');
      expect(typeof item.status).toBe('string');

      // nextCursor field present
      expect(res.body).toHaveProperty('nextCursor');
    });

    it('should return empty data array when no students', async () => {
      mockSiswaService.listSiswa.mockResolvedValue({
        data: [],
        nextCursor: null,
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/siswa')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(0);
      expect(res.body.nextCursor).toBeNull();
    });

    it('should accept query parameters without error', async () => {
      mockSiswaService.listSiswa.mockResolvedValue({
        data: [],
        nextCursor: null,
      });

      await request(app.getHttpServer())
        .get('/api/v1/siswa?limit=20&search=budi&status=aktif')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/siswa').expect(401);

      expectApiError(res.body, 401);
    });
  });

  // ─── POST /api/v1/siswa — created object shape ────────────────

  describe('POST /api/v1/siswa', () => {
    it('should return created siswa object shape', async () => {
      const createdId = '550e8400-e29b-41d4-a716-446655440002';
      mockSiswaService.createSiswa.mockResolvedValue({
        id: createdId,
        tenantId: '660e8400-e29b-41d4-a716-446655440000',
        kelasId: '770e8400-e29b-41d4-a716-446655440001',
        nama: 'Siti Nurhaliza',
        nisn: '0098765432',
        jenisKelamin: 'P',
        tanggalLahir: '2011-03-20',
        alamat: 'Jl. Merdeka No. 10',
        orangTuaId: '880e8400-e29b-41d4-a716-446655440001',
        status: 'aktif',
        createdAt: new Date().toISOString(),
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/siswa')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          nama: 'Siti Nurhaliza',
          nisn: '0098765432',
          jenisKelamin: 'P',
          tanggalLahir: '2011-03-20',
          alamat: 'Jl. Merdeka No. 10',
          kelasId: '770e8400-e29b-41d4-a716-446655440001',
          orangTuaNama: 'Ibu Siti',
          orangTuaPhone: '08123456789',
        })
        .expect(201);

      // Validate created object shape
      expectObjectWithFields(res.body, ['id', 'nama', 'status']);
      expect(typeof res.body.id).toBe('string');
      expect(typeof res.body.nama).toBe('string');
      expect(res.body.status).toBe('aktif');
    });

    it('should return 400 when nama is missing (ValidationPipe)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/siswa')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({})
        .expect(400);

      expect(res.body).toHaveProperty('statusCode', 400);
      expect(res.body).toHaveProperty('message');
    });

    it('should return 400 when jenisKelamin has invalid value', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/siswa')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          nama: 'Test Student',
          jenisKelamin: 'X',
        })
        .expect(400);

      expect(res.body).toHaveProperty('statusCode', 400);
      expect(res.body).toHaveProperty('message');
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/siswa')
        .send({ nama: 'Test Student' })
        .expect(401);

      expectApiError(res.body, 401);
    });
  });

  // ─── PATCH /api/v1/siswa/:id/soft-delete — response shape ─────

  describe('PATCH /api/v1/siswa/:id/soft-delete', () => {
    const siswaId = '550e8400-e29b-41d4-a716-446655440001';

    it('should return soft-delete result shape', async () => {
      mockSiswaService.softDeleteSiswa.mockResolvedValue({
        id: siswaId,
        nama: 'Budi Santoso',
        status: 'keluar',
        tanggalKeluar: '2024-06-01',
        alasanKeluar: 'Pindah domisili',
        processedBy: '990e8400-e29b-41d4-a716-446655440001',
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/siswa/${siswaId}/soft-delete`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          status: 'keluar',
          alasanKeluar: 'Pindah domisili',
        })
        .expect(200);

      expectObjectWithFields(res.body, ['id', 'nama', 'status']);
      expect(res.body.status).toMatch(/^(pindah_sekolah|keluar)$/);
      expect(typeof res.body.id).toBe('string');
      expect(typeof res.body.nama).toBe('string');
    });

    it('should return 400 when status is missing', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/siswa/${siswaId}/soft-delete`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({})
        .expect(400);

      expect(res.body).toHaveProperty('statusCode', 400);
      expect(res.body).toHaveProperty('message');
    });

    it('should return 400 when status has invalid value', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/siswa/${siswaId}/soft-delete`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ status: 'invalid_status' })
        .expect(400);

      expect(res.body).toHaveProperty('statusCode', 400);
      expect(res.body).toHaveProperty('message');
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/siswa/${siswaId}/soft-delete`)
        .send({ status: 'keluar' })
        .expect(401);

      expectApiError(res.body, 401);
    });
  });

  // ─── PATCH /api/v1/siswa/:id — update response shape ──────────

  describe('PATCH /api/v1/siswa/:id', () => {
    const siswaId = '550e8400-e29b-41d4-a716-446655440001';

    it('should return updated siswa object shape', async () => {
      mockSiswaService.updateSiswa.mockResolvedValue({
        id: siswaId,
        tenantId: '660e8400-e29b-41d4-a716-446655440000',
        kelasId: '770e8400-e29b-41d4-a716-446655440001',
        nama: 'Budi Santoso Updated',
        nisn: '0012345678',
        jenisKelamin: 'L',
        tanggalLahir: '2010-05-15',
        alamat: 'Jl. Baru No. 5',
        orangTuaId: '880e8400-e29b-41d4-a716-446655440001',
        status: 'aktif',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/siswa/${siswaId}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ nama: 'Budi Santoso Updated' })
        .expect(200);

      expectObjectWithFields(res.body, ['id', 'nama', 'status']);
      expect(typeof res.body.id).toBe('string');
      expect(typeof res.body.nama).toBe('string');
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/siswa/${siswaId}`)
        .send({ nama: 'Test' })
        .expect(401);

      expectApiError(res.body, 401);
    });
  });
});
