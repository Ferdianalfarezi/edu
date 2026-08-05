import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { KelasController } from '@/modules/kelas/kelas.controller';
import { KelasService } from '@/modules/kelas/kelas.service';
import { createMockTestApp, MockProviders } from './helpers/test-app.factory';
import { adminToken } from './helpers/auth.helper';
import { expectApiError, expectObjectWithFields, expectUUID } from './helpers/schema-validators';

describe('Kelas Contract Tests', () => {
  let app: INestApplication;
  let mockKelasService: Record<string, jest.Mock>;

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
    mockKelasService = {
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
      serviceOverrides: [{ provide: KelasService, useValue: mockKelasService }],
    };

    app = await createMockTestApp([KelasController], [KelasService], mocks);
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── GET /api/v1/kelas ──────────────────────────────────────────

  describe('GET /api/v1/kelas', () => {
    it('should return paginated kelas list shape', async () => {
      mockKelasService.listKelas.mockResolvedValue({
        data: [
          {
            id: '550e8400-e29b-41d4-a716-446655440001',
            nama: 'Kelas 1A',
            tingkat: 1,
            tahunAjaranId: '660e8400-e29b-41d4-a716-446655440001',
            waliKelasId: null,
            kapasitas: 30,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        nextCursor: null,
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/kelas')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);

      const kelas = res.body.data[0];
      expectObjectWithFields(kelas, ['id', 'nama', 'tingkat']);
      expect(typeof kelas.id).toBe('string');
      expect(typeof kelas.nama).toBe('string');
      expect(typeof kelas.tingkat).toBe('number');
    });

    it('should return 401 when no auth token is provided', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/kelas').expect(401);

      expectApiError(res.body, 401);
    });
  });

  // ─── GET /api/v1/kelas/:id ──────────────────────────────────────

  describe('GET /api/v1/kelas/:id', () => {
    it('should return single kelas shape with siswa array', async () => {
      const kelasId = '550e8400-e29b-41d4-a716-446655440001';
      const siswaId = '770e8400-e29b-41d4-a716-446655440001';
      mockKelasService.getKelasById.mockResolvedValue({
        id: kelasId,
        nama: 'Kelas 1A',
        tingkat: 1,
        waliKelasNama: 'Budi Santoso',
        siswa: [
          { id: siswaId, nama: 'Andi', nisn: '1234567890', status: 'aktif' },
          { id: '770e8400-e29b-41d4-a716-446655440002', nama: 'Cici', nisn: null, status: 'lulus' },
        ],
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/kelas/${kelasId}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expectObjectWithFields(res.body, ['id', 'nama', 'tingkat', 'waliKelasNama', 'siswa']);
      expectUUID(res.body.id);
      expect(typeof res.body.nama).toBe('string');
      expect(typeof res.body.tingkat).toBe('number');
      expect(Array.isArray(res.body.siswa)).toBe(true);

      const firstSiswa = res.body.siswa[0];
      expectObjectWithFields(firstSiswa, ['id', 'nama', 'nisn', 'status']);
      expectUUID(firstSiswa.id);
      expect(typeof firstSiswa.nama).toBe('string');
      expect(['aktif', 'tidak_aktif', 'pindah', 'lulus']).toContain(firstSiswa.status);
    });

    it('should return empty siswa array when no students enrolled', async () => {
      const kelasId = '550e8400-e29b-41d4-a716-446655440001';
      mockKelasService.getKelasById.mockResolvedValue({
        id: kelasId,
        nama: 'Kelas 1A',
        tingkat: 1,
        waliKelasNama: null,
        siswa: [],
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/kelas/${kelasId}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(res.body.siswa).toEqual([]);
    });

    it('should return 401 when no auth token is provided', async () => {
      const kelasId = '550e8400-e29b-41d4-a716-446655440001';
      const res = await request(app.getHttpServer()).get(`/api/v1/kelas/${kelasId}`).expect(401);

      expectApiError(res.body, 401);
    });

    it('should return 404 when kelas not found', async () => {
      const kelasId = '550e8400-e29b-41d4-a716-446655440099';
      mockKelasService.getKelasById.mockRejectedValue(
        new (require('@nestjs/common').NotFoundException)('Kelas tidak ditemukan'),
      );

      const res = await request(app.getHttpServer())
        .get(`/api/v1/kelas/${kelasId}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(404);

      expectApiError(res.body, 404);
    });
  });

  // ─── POST /api/v1/kelas ─────────────────────────────────────────

  describe('POST /api/v1/kelas', () => {
    it('should return created kelas shape on success', async () => {
      const tahunAjaranId = '660e8400-e29b-41d4-a716-446655440001';
      mockKelasService.createKelas.mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440002',
        nama: 'Kelas 2B',
        tingkat: 2,
        tahunAjaranId,
        waliKelasId: null,
        kapasitas: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/kelas')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          nama: 'Kelas 2B',
          tingkat: 2,
          tahunAjaranId,
        })
        .expect(201);

      expectObjectWithFields(res.body, ['id', 'nama', 'tingkat']);
      expectUUID(res.body.id);
      expect(res.body.nama).toBe('Kelas 2B');
      expect(res.body.tingkat).toBe(2);
    });

    it('should return 400 when required fields are missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/kelas')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({})
        .expect(400);

      expect(res.body).toHaveProperty('statusCode', 400);
      expect(res.body).toHaveProperty('message');
    });

    it('should return 400 when tahunAjaranId is not a valid UUID', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/kelas')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          nama: 'Kelas 1A',
          tingkat: 1,
          tahunAjaranId: 'not-a-uuid',
        })
        .expect(400);

      expect(res.body).toHaveProperty('statusCode', 400);
      expect(res.body).toHaveProperty('message');
    });

    it('should return 401 when no auth token is provided', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/kelas')
        .send({
          nama: 'Kelas 1A',
          tingkat: 1,
          tahunAjaranId: '660e8400-e29b-41d4-a716-446655440001',
        })
        .expect(401);

      expectApiError(res.body, 401);
    });
  });

  // ─── DELETE /api/v1/kelas/:id ───────────────────────────────────

  describe('DELETE /api/v1/kelas/:id', () => {
    it('should return success shape on delete', async () => {
      const kelasId = '550e8400-e29b-41d4-a716-446655440001';
      mockKelasService.deleteKelas.mockResolvedValue({ deleted: true });

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/kelas/${kelasId}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(res.body).toHaveProperty('deleted', true);
    });

    it('should return 401 when no auth token is provided', async () => {
      const kelasId = '550e8400-e29b-41d4-a716-446655440001';
      const res = await request(app.getHttpServer()).delete(`/api/v1/kelas/${kelasId}`).expect(401);

      expectApiError(res.body, 401);
    });
  });
});
