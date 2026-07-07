import { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as request from 'supertest';
import { TagihanController } from '@/modules/tagihan/tagihan.controller';
import { TagihanService } from '@/modules/tagihan/tagihan.service';
import { RolesGuard } from '@/common/guards/roles.guard';
import { createMockTestApp, MockProviders } from './helpers/test-app.factory';
import { bendaharaToken, guruToken } from './helpers/auth.helper';
import {
  expectPaginatedResponse,
  expectDataArray,
  expectMessageResponse,
  expectApiError,
} from './helpers/schema-validators';

describe('Tagihan Contract Tests', () => {
  let app: INestApplication;
  let mockTagihanService: Record<string, jest.Mock>;

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
    mockTagihanService = {
      listTagihan: jest.fn(),
      generateTagihan: jest.fn(),
      getPendingVerifications: jest.fn(),
      getTunggakan: jest.fn(),
      getTunggakanSummary: jest.fn(),
      exportTagihan: jest.fn(),
      getTagihanBySiswa: jest.fn(),
      getBuktiBayar: jest.fn(),
      verifyPayment: jest.fn(),
      uploadBuktiTransfer: jest.fn(),
      recordManualPayment: jest.fn(),
      deleteTagihan: jest.fn(),
      editTagihan: jest.fn(),
      cancelTagihan: jest.fn(),
    };

    const mocks: MockProviders = {
      db: mockDb,
      redis: mockRedis,
      serviceOverrides: [{ provide: TagihanService, useValue: mockTagihanService }],
    };

    app = await createMockTestApp(
      [TagihanController],
      [TagihanService, RolesGuard, Reflector],
      mocks,
    );
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── GET /api/v1/tagihan ────────────────────────────────────────

  describe('GET /api/v1/tagihan', () => {
    it('should return paginated response shape (bendahara)', async () => {
      mockTagihanService.listTagihan.mockResolvedValue({
        data: [
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
            siswa_id: '660e8400-e29b-41d4-a716-446655440001',
            siswa_nama: 'Budi Santoso',
            kelas_nama: 'Kelas 1A',
            bulan: 1,
            tahun: 2025,
            nominal: 250000,
            total_dibayar: 0,
            status: 'belum_bayar',
            tanggal_jatuh_tempo: '2025-01-10',
            created_at: '2025-01-01T00:00:00.000Z',
          },
        ],
        meta: {
          has_next: false,
          cursor: null,
        },
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/tagihan?limit=20')
        .set('Authorization', `Bearer ${bendaharaToken()}`)
        .expect(200);

      expectPaginatedResponse(res.body, (item: any) => {
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('siswa_nama');
        expect(item).toHaveProperty('kelas_nama');
        expect(item).toHaveProperty('bulan');
        expect(item).toHaveProperty('tahun');
        expect(item).toHaveProperty('nominal');
        expect(item).toHaveProperty('total_dibayar');
        expect(item).toHaveProperty('status');
        expect(item).toHaveProperty('tanggal_jatuh_tempo');
        expect(item).toHaveProperty('created_at');
        expect(typeof item.id).toBe('string');
        expect(typeof item.nominal).toBe('number');
        expect(typeof item.status).toBe('string');
      });
    });
  });

  // ─── POST /api/v1/tagihan/generate ──────────────────────────────

  describe('POST /api/v1/tagihan/generate', () => {
    it('should return { message, data: { created, skipped, total_nominal } } shape', async () => {
      mockTagihanService.generateTagihan.mockResolvedValue({
        created: 30,
        skipped: 2,
        total_nominal: 7500000,
        months_processed: 1,
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/tagihan/generate')
        .set('Authorization', `Bearer ${bendaharaToken()}`)
        .send({ bulan: 1, tahun: 2025 })
        .expect(201);

      // Controller wraps service result: { message, data: result }
      expect(res.body).toHaveProperty('message');
      expect(typeof res.body.message).toBe('string');
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('created');
      expect(typeof res.body.data.created).toBe('number');
      expect(res.body.data).toHaveProperty('skipped');
      expect(typeof res.body.data.skipped).toBe('number');
      expect(res.body.data).toHaveProperty('total_nominal');
      expect(typeof res.body.data.total_nominal).toBe('number');
    });
  });

  // ─── GET /api/v1/tagihan/verifikasi ─────────────────────────────

  describe('GET /api/v1/tagihan/verifikasi', () => {
    it('should return { data: [] } array response shape', async () => {
      mockTagihanService.getPendingVerifications.mockResolvedValue([
        {
          tagihan_id: '550e8400-e29b-41d4-a716-446655440000',
          siswa_id: '660e8400-e29b-41d4-a716-446655440001',
          siswa_nama: 'Budi Santoso',
          bulan: 1,
          tahun: 2025,
          nominal: 250000,
          total_dibayar: 0,
          sisa_tagihan: 250000,
          transaksi: {
            id: '770e8400-e29b-41d4-a716-446655440002',
            jumlah_bayar: 250000,
            nomor_referensi: 'BT-1234567890-ABCD1234',
            bukti_preview_url: 'https://storage.example.com/bukti/test.jpg',
            created_at: '2025-01-05T10:00:00.000Z',
          },
        },
      ]);

      const res = await request(app.getHttpServer())
        .get('/api/v1/tagihan/verifikasi')
        .set('Authorization', `Bearer ${bendaharaToken()}`)
        .expect(200);

      expectDataArray(res.body);
      if (res.body.data.length > 0) {
        const item = res.body.data[0];
        expect(item).toHaveProperty('tagihan_id');
        expect(item).toHaveProperty('siswa_nama');
        expect(item).toHaveProperty('bulan');
        expect(item).toHaveProperty('tahun');
        expect(item).toHaveProperty('nominal');
        expect(item).toHaveProperty('transaksi');
      }
    });
  });

  // ─── GET /api/v1/tagihan/tunggakan ──────────────────────────────

  describe('GET /api/v1/tagihan/tunggakan', () => {
    it('should return { data } response shape', async () => {
      mockTagihanService.getTunggakan.mockResolvedValue({
        items: [
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
            siswa_id: '660e8400-e29b-41d4-a716-446655440001',
            siswa_nama: 'Budi Santoso',
            siswa_status: 'aktif',
            kelas_id: '880e8400-e29b-41d4-a716-446655440003',
            kelas_nama: 'Kelas 1A',
            bulan: 1,
            tahun: 2025,
            nominal: 250000,
            total_dibayar: 0,
            sisa_tagihan: 250000,
            status: 'belum_bayar',
            tanggal_jatuh_tempo: '2025-01-10',
          },
        ],
        total_tunggakan: 250000,
        total_count: 1,
        next_cursor: null,
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/tagihan/tunggakan')
        .set('Authorization', `Bearer ${bendaharaToken()}`)
        .expect(200);

      // Controller wraps: { data: result }
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('items');
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data).toHaveProperty('total_tunggakan');
      expect(res.body.data).toHaveProperty('total_count');
    });
  });

  // ─── DELETE /api/v1/tagihan/:id ─────────────────────────────────

  describe('DELETE /api/v1/tagihan/:id', () => {
    it('should return { message } shape', async () => {
      mockTagihanService.deleteTagihan.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .delete('/api/v1/tagihan/550e8400-e29b-41d4-a716-446655440000')
        .set('Authorization', `Bearer ${bendaharaToken()}`)
        .expect(200);

      expectMessageResponse(res.body);
    });
  });

  // ─── 401 without token ──────────────────────────────────────────

  describe('401 without token', () => {
    it('GET /api/v1/tagihan should return 401 without auth token', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/tagihan').expect(401);

      expectApiError(res.body, 401);
    });

    it('POST /api/v1/tagihan/generate should return 401 without auth token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/tagihan/generate')
        .send({ bulan: 1, tahun: 2025 })
        .expect(401);

      expectApiError(res.body, 401);
    });
  });

  // ─── 403 wrong role ─────────────────────────────────────────────

  describe('403 wrong role', () => {
    it('GET /api/v1/tagihan should return 403 for guru role', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/tagihan')
        .set('Authorization', `Bearer ${guruToken()}`)
        .expect(403);

      expectApiError(res.body, 403);
    });

    it('POST /api/v1/tagihan/generate should return 403 for guru role', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/tagihan/generate')
        .set('Authorization', `Bearer ${guruToken()}`)
        .send({ bulan: 1, tahun: 2025 })
        .expect(403);

      expectApiError(res.body, 403);
    });

    it('DELETE /api/v1/tagihan/:id should return 403 for guru role', async () => {
      const res = await request(app.getHttpServer())
        .delete('/api/v1/tagihan/550e8400-e29b-41d4-a716-446655440000')
        .set('Authorization', `Bearer ${guruToken()}`)
        .expect(403);

      expectApiError(res.body, 403);
    });
  });
});
