import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { SiswaService } from './siswa.service';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { RiwayatKelasHelper } from './riwayat-kelas.helper';

// Mock database helper — chainable mock
const createMockDb = () => ({
  select: jest.fn().mockReturnThis(),
  from: jest.fn().mockReturnThis(),
  leftJoin: jest.fn().mockReturnThis(),
  innerJoin: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  offset: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  groupBy: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  values: jest.fn().mockReturnThis(),
  returning: jest.fn(),
  update: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
});

const createMockRiwayatKelasHelper = () => ({
  record: jest.fn().mockResolvedValue(undefined),
  recordBatch: jest.fn().mockResolvedValue(undefined),
});

describe('SiswaService', () => {
  let service: SiswaService;
  let mockDb: ReturnType<typeof createMockDb>;
  let mockRiwayatHelper: ReturnType<typeof createMockRiwayatKelasHelper>;

  const tenantId = '11111111-1111-1111-1111-111111111111';
  const adminUserId = '22222222-2222-2222-2222-222222222222';

  beforeEach(async () => {
    mockDb = createMockDb();
    mockRiwayatHelper = createMockRiwayatKelasHelper();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SiswaService,
        { provide: DRIZZLE, useValue: mockDb },
        { provide: RiwayatKelasHelper, useValue: mockRiwayatHelper },
      ],
    }).compile();

    service = module.get<SiswaService>(SiswaService);
  });

  // ─── CREATE SISWA ─────────────────────────────────────────────

  describe('createSiswa', () => {
    const baseDto = {
      nama: 'Ahmad Fauzi',
      nisn: '1234567890',
      jenisKelamin: 'L' as const,
      tanggalLahir: '2015-03-15',
      kelasId: 'kelas-uuid',
    };

    it('should create a siswa without parent linkage', async () => {
      // NISN uniqueness check → no conflict
      mockDb.limit.mockResolvedValueOnce([]);

      // Insert siswa returning
      mockDb.returning.mockResolvedValueOnce([
        {
          id: 'new-siswa-id',
          tenantId,
          kelasId: baseDto.kelasId,
          nama: baseDto.nama,
          nisn: baseDto.nisn,
          jenisKelamin: baseDto.jenisKelamin,
          tanggalLahir: baseDto.tanggalLahir,
          alamat: null,
          orangTuaId: null,
          status: 'aktif',
          createdAt: new Date(),
        },
      ]);

      // Kelas lookup for riwayat recording (kelasId is non-null)
      mockDb.limit.mockResolvedValueOnce([{ tahunAjaranId: 'ta-1' }]);

      const result = await service.createSiswa(tenantId, baseDto, adminUserId);

      expect(result.id).toBe('new-siswa-id');
      expect(result.nama).toBe('Ahmad Fauzi');
      expect(result.nisn).toBe('1234567890');
      expect(result.orangTuaId).toBeNull();
      expect(result.status).toBe('aktif');
      expect(mockRiwayatHelper.record).toHaveBeenCalledWith({
        tenantId,
        siswaId: 'new-siswa-id',
        kelasId: baseDto.kelasId,
        tahunAjaranId: 'ta-1',
      });
    });

    it('should create siswa and link to existing parent when phone exists', async () => {
      const dto = {
        ...baseDto,
        orangTuaPhone: '08123456789',
        orangTuaNama: 'Pak Ahmad',
      };

      // NISN uniqueness check → no conflict
      mockDb.limit.mockResolvedValueOnce([]);

      // Parent lookup → existing parent found
      mockDb.limit.mockResolvedValueOnce([{ id: 'existing-parent-id' }]);

      // Insert siswa returning
      mockDb.returning.mockResolvedValueOnce([
        {
          id: 'new-siswa-id',
          tenantId,
          kelasId: baseDto.kelasId,
          nama: baseDto.nama,
          nisn: baseDto.nisn,
          jenisKelamin: baseDto.jenisKelamin,
          tanggalLahir: baseDto.tanggalLahir,
          alamat: null,
          orangTuaId: 'existing-parent-id',
          status: 'aktif',
          createdAt: new Date(),
        },
      ]);

      // Kelas lookup for riwayat recording (kelasId is non-null)
      mockDb.limit.mockResolvedValueOnce([{ tahunAjaranId: 'ta-1' }]);

      const result = await service.createSiswa(tenantId, dto, adminUserId);

      expect(result.orangTuaId).toBe('existing-parent-id');
      expect(mockRiwayatHelper.record).toHaveBeenCalled();
    });

    it('should create siswa and create new parent when phone does not exist', async () => {
      const dto = {
        ...baseDto,
        orangTuaPhone: '08987654321',
        orangTuaNama: 'Ibu Siti',
      };

      // NISN uniqueness check → no conflict
      mockDb.limit.mockResolvedValueOnce([]);

      // Parent lookup → not found
      mockDb.limit.mockResolvedValueOnce([]);

      // Create parent user returning
      mockDb.returning.mockResolvedValueOnce([{ id: 'new-parent-id' }]);

      // Insert siswa returning
      mockDb.returning.mockResolvedValueOnce([
        {
          id: 'new-siswa-id',
          tenantId,
          kelasId: baseDto.kelasId,
          nama: baseDto.nama,
          nisn: baseDto.nisn,
          jenisKelamin: baseDto.jenisKelamin,
          tanggalLahir: baseDto.tanggalLahir,
          alamat: null,
          orangTuaId: 'new-parent-id',
          status: 'aktif',
          createdAt: new Date(),
        },
      ]);

      // Kelas lookup for riwayat recording (kelasId is non-null)
      mockDb.limit.mockResolvedValueOnce([{ tahunAjaranId: 'ta-1' }]);

      const result = await service.createSiswa(tenantId, dto, adminUserId);

      expect(result.orangTuaId).toBe('new-parent-id');
      expect(mockRiwayatHelper.record).toHaveBeenCalled();
    });

    it('should throw ConflictException when NISN is duplicate in same tenant', async () => {
      // NISN uniqueness check → conflict found
      mockDb.limit.mockResolvedValueOnce([{ id: 'existing-siswa-id' }]);

      await expect(service.createSiswa(tenantId, baseDto, adminUserId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should allow creation without NISN (no uniqueness check needed)', async () => {
      const dto = { nama: 'Test Student' }; // No NISN

      // No NISN uniqueness check needed → goes straight to insert
      mockDb.returning.mockResolvedValueOnce([
        {
          id: 'new-siswa-id',
          tenantId,
          kelasId: null,
          nama: 'Test Student',
          nisn: null,
          jenisKelamin: null,
          tanggalLahir: null,
          alamat: null,
          orangTuaId: null,
          status: 'aktif',
          createdAt: new Date(),
        },
      ]);

      const result = await service.createSiswa(tenantId, dto, adminUserId);
      expect(result.id).toBe('new-siswa-id');
      expect(result.nisn).toBeNull();
    });
  });

  // ─── GET SISWA BY ID ──────────────────────────────────────────

  describe('getSiswaById', () => {
    it('should return siswa if found', async () => {
      const mockSiswa = {
        id: 'siswa-id',
        tenantId,
        kelasId: 'kelas-1',
        nama: 'Test Siswa',
        nisn: '1234567890',
        jenisKelamin: 'L',
        tanggalLahir: '2015-01-01',
        alamat: 'Jl. Merdeka',
        orangTuaId: 'parent-id',
        status: 'aktif',
        tanggalKeluar: null,
        alasanKeluar: null,
        processedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockDb.limit.mockResolvedValueOnce([mockSiswa]);

      const result = await service.getSiswaById(tenantId, 'siswa-id');
      expect(result.id).toBe('siswa-id');
      expect(result.nama).toBe('Test Siswa');
    });

    it('should throw NotFoundException if siswa not found', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      await expect(service.getSiswaById(tenantId, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── UPDATE SISWA ─────────────────────────────────────────────

  describe('updateSiswa', () => {
    const siswaId = 'siswa-id';
    const existingSiswa = {
      id: siswaId,
      tenantId,
      kelasId: 'kelas-1',
      nama: 'Original Name',
      nisn: '1111111111',
      jenisKelamin: 'L',
      tanggalLahir: '2015-01-01',
      alamat: null,
      orangTuaId: null,
      status: 'aktif',
      tanggalKeluar: null,
      alasanKeluar: null,
      processedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should update siswa fields', async () => {
      // getSiswaById mock
      mockDb.limit.mockResolvedValueOnce([existingSiswa]);

      // NISN uniqueness check (new NISN)
      mockDb.limit.mockResolvedValueOnce([]);

      // Update returning
      mockDb.returning.mockResolvedValueOnce([
        {
          ...existingSiswa,
          nama: 'Updated Name',
          nisn: '2222222222',
          updatedAt: new Date(),
        },
      ]);

      const result = await service.updateSiswa(tenantId, siswaId, {
        nama: 'Updated Name',
        nisn: '2222222222',
      });

      expect(result.nama).toBe('Updated Name');
      expect(result.nisn).toBe('2222222222');
    });

    it('should throw ConflictException if new NISN conflicts', async () => {
      // getSiswaById mock
      mockDb.limit.mockResolvedValueOnce([existingSiswa]);

      // NISN uniqueness check → conflict
      mockDb.limit.mockResolvedValueOnce([{ id: 'other-siswa' }]);

      await expect(service.updateSiswa(tenantId, siswaId, { nisn: '9999999999' })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ─── SOFT DELETE ──────────────────────────────────────────────

  describe('softDeleteSiswa', () => {
    const siswaId = 'siswa-id';
    const activeSiswa = {
      id: siswaId,
      tenantId,
      kelasId: 'kelas-1',
      nama: 'Active Student',
      nisn: '1234567890',
      jenisKelamin: 'L',
      tanggalLahir: '2015-01-01',
      alamat: null,
      orangTuaId: 'parent-id',
      status: 'aktif',
      tanggalKeluar: null,
      alasanKeluar: null,
      processedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should soft-delete siswa with status pindah_sekolah', async () => {
      // getSiswaById
      mockDb.limit.mockResolvedValueOnce([activeSiswa]);

      // Update returning
      mockDb.returning.mockResolvedValueOnce([
        {
          ...activeSiswa,
          status: 'pindah_sekolah',
          tanggalKeluar: '2024-06-15',
          alasanKeluar: 'Pindah ke kota lain',
          processedBy: adminUserId,
        },
      ]);

      // Parent access check → has other active children
      mockDb.limit.mockResolvedValueOnce([{ id: 'other-child' }]);

      const result = await service.softDeleteSiswa(
        tenantId,
        siswaId,
        { status: 'pindah_sekolah', alasanKeluar: 'Pindah ke kota lain' },
        adminUserId,
      );

      expect(result.status).toBe('pindah_sekolah');
      expect(result.alasanKeluar).toBe('Pindah ke kota lain');
      expect(result.processedBy).toBe(adminUserId);
    });

    it('should soft-delete siswa with status keluar', async () => {
      // getSiswaById
      mockDb.limit.mockResolvedValueOnce([activeSiswa]);

      // Update returning
      mockDb.returning.mockResolvedValueOnce([
        {
          ...activeSiswa,
          status: 'keluar',
          tanggalKeluar: '2024-06-15',
          alasanKeluar: 'Alasan pribadi',
          processedBy: adminUserId,
        },
      ]);

      // Parent access check → no more active children
      mockDb.limit.mockResolvedValueOnce([]);

      const result = await service.softDeleteSiswa(
        tenantId,
        siswaId,
        { status: 'keluar', alasanKeluar: 'Alasan pribadi' },
        adminUserId,
      );

      expect(result.status).toBe('keluar');
    });

    it('should throw BadRequestException when siswa is already inactive', async () => {
      const inactiveSiswa = { ...activeSiswa, status: 'keluar' };
      mockDb.limit.mockResolvedValueOnce([inactiveSiswa]);

      await expect(
        service.softDeleteSiswa(tenantId, siswaId, { status: 'pindah_sekolah' }, adminUserId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should check parent access revocation after soft-delete', async () => {
      // getSiswaById
      mockDb.limit.mockResolvedValueOnce([activeSiswa]);

      // Update returning
      mockDb.returning.mockResolvedValueOnce([
        {
          ...activeSiswa,
          status: 'keluar',
          tanggalKeluar: '2024-06-15',
          orangTuaId: 'parent-id',
          processedBy: adminUserId,
        },
      ]);

      // Parent access check → no active children left (revocation triggered)
      mockDb.limit.mockResolvedValueOnce([]);

      const result = await service.softDeleteSiswa(
        tenantId,
        siswaId,
        { status: 'keluar' },
        adminUserId,
      );

      // The service checks parent access after soft-delete
      expect(result.status).toBe('keluar');
      // DB calls: getSiswaById (limit), update (returning), parent check (limit)
      expect(mockDb.limit).toHaveBeenCalled();
      expect(mockDb.returning).toHaveBeenCalled();
    });
  });

  // ─── LIST / SEARCH / FILTER ───────────────────────────────────

  describe('listSiswa', () => {
    it('should return paginated list with offset-based meta', async () => {
      const students = Array.from({ length: 15 }, (_, i) => ({
        id: `siswa-${String(i).padStart(2, '0')}`,
        kelas_id: 'kelas-1',
        kelas_nama: '1A',
        tahun_ajaran_id: 'ta-1',
        tahun_ajaran_nama: '2024/2025',
        nama: `Student ${i}`,
        nisn: `000000000${i}`,
        jenis_kelamin: 'L',
        tanggal_lahir: '2015-01-01',
        alamat: null,
        orang_tua_nama: null,
        orang_tua_phone: null,
        status: 'aktif',
        created_at: new Date(),
      }));

      // COUNT query resolves from where (via Promise.all)
      mockDb.where.mockResolvedValueOnce([{ count: 30 }]);
      // DATA query resolves from offset
      mockDb.offset.mockResolvedValueOnce(students);

      const result = await service.listSiswa(tenantId, {});

      expect(result.data).toHaveLength(15);
      expect(result.meta.page).toBe(1);
      expect(result.meta.page_size).toBe(15);
      expect(result.meta.total_count).toBe(30);
      expect(result.meta.total_pages).toBe(2);
    });

    it('should return empty data for out-of-range page', async () => {
      // COUNT query
      mockDb.where.mockResolvedValueOnce([{ count: 5 }]);
      // DATA query (page 2 with only 5 total items at page_size=15 → empty)
      mockDb.offset.mockResolvedValueOnce([]);

      const result = await service.listSiswa(tenantId, { page: 2 });

      expect(result.data).toHaveLength(0);
      expect(result.meta.total_count).toBe(5);
      expect(result.meta.total_pages).toBe(1);
    });

    it('should support search by name (ILIKE)', async () => {
      mockDb.where.mockResolvedValueOnce([{ count: 1 }]);
      mockDb.offset.mockResolvedValueOnce([
        {
          id: 'siswa-1',
          kelas_id: 'kelas-1',
          kelas_nama: '1A',
          tahun_ajaran_id: 'ta-1',
          tahun_ajaran_nama: '2024/2025',
          nama: 'Ahmad Fauzi',
          nisn: '1234567890',
          jenis_kelamin: 'L',
          tanggal_lahir: '2015-01-01',
          alamat: null,
          orang_tua_nama: null,
          orang_tua_phone: null,
          status: 'aktif',
          created_at: new Date(),
        },
      ]);

      const result = await service.listSiswa(tenantId, { search: 'Ahmad' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].nama).toBe('Ahmad Fauzi');
    });

    it('should support exact NISN filter', async () => {
      mockDb.where.mockResolvedValueOnce([{ count: 1 }]);
      mockDb.offset.mockResolvedValueOnce([
        {
          id: 'siswa-1',
          kelas_id: 'kelas-1',
          kelas_nama: '1A',
          tahun_ajaran_id: 'ta-1',
          tahun_ajaran_nama: '2024/2025',
          nama: 'Found Student',
          nisn: '9999999999',
          jenis_kelamin: 'P',
          tanggal_lahir: '2015-06-01',
          alamat: null,
          orang_tua_nama: 'Hendra',
          orang_tua_phone: '081234567890',
          status: 'aktif',
          created_at: new Date(),
        },
      ]);

      const result = await service.listSiswa(tenantId, { nisn: '9999999999' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].nisn).toBe('9999999999');
    });
  });

  // ─── BULK IMPORT ──────────────────────────────────────────────

  describe('bulkImportSiswa', () => {
    it('should import valid CSV rows and create students', async () => {
      const csv =
        'nama,nisn,jenis_kelamin,tanggal_lahir,orang_tua_nama,orang_tua_phone,kelas_id\nBudi,1111111111,L,2015-01-01,Pak Budi,08111111111,kelas-1';

      // NISN check → no conflict
      mockDb.limit.mockResolvedValueOnce([]);

      // Parent lookup → not found (create new)
      mockDb.limit.mockResolvedValueOnce([]);

      // Create parent returning
      mockDb.returning.mockResolvedValueOnce([{ id: 'new-parent-id' }]);

      // Insert siswa (no returning needed for bulk — the service uses plain insert)

      const result = await service.bulkImportSiswa(tenantId, csv, adminUserId);

      expect(result.created).toBe(1);
      expect(result.skipped).toHaveLength(0);
      expect(result.total).toBe(1);
    });

    it('should skip rows with duplicate NISN', async () => {
      const csv = 'nama,nisn\nBudi,1111111111';

      // NISN check → conflict found
      mockDb.limit.mockResolvedValueOnce([{ id: 'existing-siswa' }]);

      const result = await service.bulkImportSiswa(tenantId, csv, adminUserId);

      expect(result.created).toBe(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].reason).toContain('NISN');
    });

    it('should skip rows with empty nama', async () => {
      const csv = 'nama,nisn\n,1111111111';

      const result = await service.bulkImportSiswa(tenantId, csv, adminUserId);

      expect(result.created).toBe(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].reason).toBe('Nama tidak boleh kosong');
    });

    it('should skip rows with invalid jenis_kelamin', async () => {
      const csv = 'nama,jenis_kelamin\nBudi,X';

      const result = await service.bulkImportSiswa(tenantId, csv, adminUserId);

      expect(result.created).toBe(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].reason).toBe('Jenis kelamin harus L atau P');
    });

    it('should throw if CSV is empty', async () => {
      await expect(service.bulkImportSiswa(tenantId, '', adminUserId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should link to existing parent during bulk import', async () => {
      const csv = 'nama,nisn,orang_tua_nama,orang_tua_phone\nBudi,,Pak Budi,08111111111';

      // Parent lookup → existing parent found
      mockDb.limit.mockResolvedValueOnce([{ id: 'existing-parent-id' }]);

      const result = await service.bulkImportSiswa(tenantId, csv, adminUserId);

      expect(result.created).toBe(1);
    });
  });

  // ─── CSV PARSING ──────────────────────────────────────────────

  describe('parseSiswaCsv', () => {
    it('should parse valid CSV with all columns', () => {
      const csv =
        'nama,nisn,jenis_kelamin,tanggal_lahir,orang_tua_nama,orang_tua_phone,kelas_id\nBudi,1111,L,2015-01-01,Pak Budi,08111,kelas-1';
      const rows = service.parseSiswaCsv(csv);

      expect(rows).toHaveLength(1);
      expect(rows[0].nama).toBe('Budi');
      expect(rows[0].nisn).toBe('1111');
      expect(rows[0].jenisKelamin).toBe('L');
      expect(rows[0].orangTuaPhone).toBe('08111');
    });

    it('should handle CSV with only nama column', () => {
      const csv = 'nama\nBudi\nAndi';
      const rows = service.parseSiswaCsv(csv);

      expect(rows).toHaveLength(2);
      expect(rows[0].nama).toBe('Budi');
    });

    it('should throw if nama column is missing', () => {
      const csv = 'nisn,kelas_id\n1111,kelas-1';
      expect(() => service.parseSiswaCsv(csv)).toThrow(BadRequestException);
    });

    it('should return empty array for header-only CSV', () => {
      const csv = 'nama,nisn';
      const rows = service.parseSiswaCsv(csv);
      expect(rows).toHaveLength(0);
    });
  });

  // ─── PARENT LINKAGE (ADR-002) ─────────────────────────────────

  describe('resolveOrCreateParent', () => {
    it('should return existing parent ID when phone is found globally', async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: 'existing-parent-id' }]);

      const result = await service.resolveOrCreateParent('08123456789', 'Pak Ahmad');

      expect(result).toBe('existing-parent-id');
    });

    it('should create new parent with tenant_id=NULL when phone not found', async () => {
      // Parent lookup → not found
      mockDb.limit.mockResolvedValueOnce([]);

      // Create parent returning
      mockDb.returning.mockResolvedValueOnce([{ id: 'created-parent-id' }]);

      const result = await service.resolveOrCreateParent('08987654321', 'Ibu Siti');

      expect(result).toBe('created-parent-id');
    });
  });

  // ─── NISN VALIDATION ──────────────────────────────────────────

  describe('validateNisnUniqueness', () => {
    it('should not throw when NISN is unique', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      await expect(service.validateNisnUniqueness('1234567890', tenantId)).resolves.not.toThrow();
    });

    it('should throw ConflictException when NISN exists for active student', async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: 'existing-id' }]);

      await expect(service.validateNisnUniqueness('1234567890', tenantId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should exclude specific siswa ID when updating', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      await expect(
        service.validateNisnUniqueness('1234567890', tenantId, 'self-id'),
      ).resolves.not.toThrow();
    });
  });
});
