import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AbsensiController } from '@/modules/absensi/absensi.controller';
import { AbsensiService } from '@/modules/absensi/absensi.service';
import { createMockTestApp, MockProviders } from './helpers/test-app.factory';
import { guruToken, kepalaSekolahToken } from './helpers/auth.helper';
import {
  expectDataArray,
  expectApiError,
  expectObjectWithFields,
} from './helpers/schema-validators';

describe('Absensi Contract Tests', () => {
  let app: INestApplication;
  let mockAbsensiService: Record<string, jest.Mock>;

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
    mockAbsensiService = {
      getKelasHariIni: jest.fn(),
      getAbsensiByKelasAndTanggal: jest.fn(),
      createAbsensi: jest.fn(),
      updateAbsensi: jest.fn(),
      getDashboard: jest.fn(),
      getAuditLog: jest.fn(),
      getRekapAbsensi: jest.fn(),
      exportRekapAbsensi: jest.fn(),
      getAbsensiAnak: jest.fn(),
      syncAbsensi: jest.fn(),
    };

    const mocks: MockProviders = {
      db: mockDb,
      redis: mockRedis,
      serviceOverrides: [{ provide: AbsensiService, useValue: mockAbsensiService }],
    };

    app = await createMockTestApp([AbsensiController], [AbsensiService], mocks);
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── GET /api/v1/absensi/kelas-hari-ini ─────────────────────────

  describe('GET /api/v1/absensi/kelas-hari-ini', () => {
    it('should return { kelas: [] } shape with class details (guru)', async () => {
      mockAbsensiService.getKelasHariIni.mockResolvedValue({
        tanggal: '2025-01-20',
        hari: 'senin',
        kelas: [
          {
            kelasId: '550e8400-e29b-41d4-a716-446655440001',
            kelasNama: 'Kelas 1A',
            jamMulai: '07:00',
            jamSelesai: '08:30',
          },
          {
            kelasId: '550e8400-e29b-41d4-a716-446655440002',
            kelasNama: 'Kelas 2B',
            jamMulai: '09:00',
            jamSelesai: '10:30',
          },
        ],
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/absensi/kelas-hari-ini')
        .set('Authorization', `Bearer ${guruToken()}`)
        .expect(200);

      expect(res.body).toHaveProperty('kelas');
      expect(Array.isArray(res.body.kelas)).toBe(true);
      expect(res.body).toHaveProperty('tanggal');
      expect(typeof res.body.tanggal).toBe('string');

      if (res.body.kelas.length > 0) {
        const kelas = res.body.kelas[0];
        expect(kelas).toHaveProperty('kelasId');
        expect(kelas).toHaveProperty('kelasNama');
        expect(typeof kelas.kelasId).toBe('string');
        expect(typeof kelas.kelasNama).toBe('string');
      }
    });

    it('should return 401 when no auth token is provided', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/absensi/kelas-hari-ini')
        .expect(401);

      expectApiError(res.body, 401);
    });
  });

  // ─── GET /api/v1/absensi?kelas_id=&tanggal= ────────────────────

  describe('GET /api/v1/absensi?kelas_id=&tanggal=', () => {
    it('should return attendance data shape with records', async () => {
      const kelasId = '550e8400-e29b-41d4-a716-446655440001';
      const tanggal = '2025-01-20';

      mockAbsensiService.getAbsensiByKelasAndTanggal.mockResolvedValue({
        kelas_id: kelasId,
        kelas_nama: 'Kelas 1A',
        tanggal,
        can_edit: true,
        records: [
          {
            siswa_id: '770e8400-e29b-41d4-a716-446655440001',
            siswa_nama: 'Ahmad',
            status: 'hadir',
          },
          {
            siswa_id: '770e8400-e29b-41d4-a716-446655440002',
            siswa_nama: 'Budi',
            status: 'alpa',
          },
        ],
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/absensi?kelas_id=${kelasId}&tanggal=${tanggal}`)
        .set('Authorization', `Bearer ${guruToken()}`)
        .expect(200);

      expect(res.body).toHaveProperty('kelas_id');
      expect(res.body).toHaveProperty('tanggal');
      expect(res.body).toHaveProperty('records');
      expect(Array.isArray(res.body.records)).toBe(true);

      if (res.body.records.length > 0) {
        const record = res.body.records[0];
        expectObjectWithFields(record, ['siswa_id', 'status']);
        expect(typeof record.siswa_id).toBe('string');
        expect(typeof record.status).toBe('string');
      }
    });

    it('should return { data: [] } when no params are provided', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/absensi')
        .set('Authorization', `Bearer ${guruToken()}`)
        .expect(200);

      // Controller returns { data: [] } directly when kelas_id/tanggal are missing
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(0);
    });

    it('should return 401 when no auth token is provided', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/absensi').expect(401);

      expectApiError(res.body, 401);
    });
  });

  // ─── POST /api/v1/absensi/kelas/:kelasId ────────────────────────

  describe('POST /api/v1/absensi/kelas/:kelasId', () => {
    it('should return success response shape', async () => {
      const kelasId = '550e8400-e29b-41d4-a716-446655440001';

      mockAbsensiService.createAbsensi.mockResolvedValue({
        message: 'Absensi berhasil disimpan',
        inserted: 2,
        skipped: 0,
        tanggal: '2025-01-20',
        kelas: 'Kelas 1A',
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/absensi/kelas/${kelasId}`)
        .set('Authorization', `Bearer ${guruToken()}`)
        .send({
          tanggal: '2025-01-20',
          records: [
            { siswa_id: '770e8400-e29b-41d4-a716-446655440001', status: 'hadir' },
            { siswa_id: '770e8400-e29b-41d4-a716-446655440002', status: 'alpa' },
          ],
        })
        .expect(201);

      expect(res.body).toHaveProperty('message');
      expect(typeof res.body.message).toBe('string');
      expect(res.body).toHaveProperty('inserted');
      expect(typeof res.body.inserted).toBe('number');
      expect(res.body).toHaveProperty('tanggal');
    });

    it('should return 400 when body is empty', async () => {
      const kelasId = '550e8400-e29b-41d4-a716-446655440001';

      const res = await request(app.getHttpServer())
        .post(`/api/v1/absensi/kelas/${kelasId}`)
        .set('Authorization', `Bearer ${guruToken()}`)
        .send({})
        .expect(400);

      expect(res.body).toHaveProperty('statusCode', 400);
      expect(res.body).toHaveProperty('message');
    });

    it('should return 401 when no auth token is provided', async () => {
      const kelasId = '550e8400-e29b-41d4-a716-446655440001';

      const res = await request(app.getHttpServer())
        .post(`/api/v1/absensi/kelas/${kelasId}`)
        .send({
          tanggal: '2025-01-20',
          records: [{ siswa_id: '770e8400-e29b-41d4-a716-446655440001', status: 'hadir' }],
        })
        .expect(401);

      expectApiError(res.body, 401);
    });
  });

  // ─── GET /api/v1/absensi/dashboard ──────────────────────────────

  describe('GET /api/v1/absensi/dashboard', () => {
    it('should return dashboard shape with ringkasan_per_kelas and perhatian_khusus (kepala_sekolah)', async () => {
      mockAbsensiService.getDashboard.mockResolvedValue({
        tanggal: '2025-01-20',
        ringkasan_per_kelas: [
          {
            kelas_id: '550e8400-e29b-41d4-a716-446655440001',
            kelas_nama: 'Kelas 1A',
            total_siswa: 30,
            hadir: 25,
            izin: 2,
            sakit: 1,
            alpa: 2,
          },
        ],
        perhatian_khusus: [
          {
            siswa_id: '770e8400-e29b-41d4-a716-446655440001',
            siswa_nama: 'Ahmad',
            kelas_nama: 'Kelas 1A',
            total_alpa: 12,
          },
        ],
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/absensi/dashboard')
        .set('Authorization', `Bearer ${kepalaSekolahToken()}`)
        .expect(200);

      expect(res.body).toHaveProperty('tanggal');
      expect(typeof res.body.tanggal).toBe('string');
      expect(res.body).toHaveProperty('ringkasan_per_kelas');
      expect(Array.isArray(res.body.ringkasan_per_kelas)).toBe(true);
      expect(res.body).toHaveProperty('perhatian_khusus');
      expect(Array.isArray(res.body.perhatian_khusus)).toBe(true);

      if (res.body.ringkasan_per_kelas.length > 0) {
        const summary = res.body.ringkasan_per_kelas[0];
        expectObjectWithFields(summary, [
          'kelas_id',
          'kelas_nama',
          'total_siswa',
          'hadir',
          'izin',
          'sakit',
          'alpa',
        ]);
        expect(typeof summary.kelas_id).toBe('string');
        expect(typeof summary.total_siswa).toBe('number');
        expect(typeof summary.hadir).toBe('number');
      }

      if (res.body.perhatian_khusus.length > 0) {
        const alert = res.body.perhatian_khusus[0];
        expectObjectWithFields(alert, ['siswa_id', 'siswa_nama', 'total_alpa']);
        expect(typeof alert.total_alpa).toBe('number');
      }
    });

    it('should return 403 when guru tries to access dashboard', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/absensi/dashboard')
        .set('Authorization', `Bearer ${guruToken()}`)
        .expect(403);

      expectApiError(res.body, 403);
    });

    it('should return 401 when no auth token is provided', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/absensi/dashboard').expect(401);

      expectApiError(res.body, 401);
    });
  });
});
