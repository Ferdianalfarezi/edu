import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { StorageService } from '@/modules/storage/storage.service';
import { RppService } from './rpp.service';
import { GetRppQueryDto } from './dto/get-rpp-query.dto';

/**
 * Unit tests for RPP Portal methods: list, getDetail, getDownloadUrl.
 *
 * Requirements: 43.1–43.7
 */
describe('RppService — Portal', () => {
  let service: RppService;
  let mockDb: any;
  let mockStorageService: jest.Mocked<Partial<StorageService>>;

  const TENANT_ID = '11111111-1111-1111-1111-111111111111';
  const RPP_ID = '44444444-4444-4444-4444-444444444444';
  const GURU_ID = '22222222-2222-2222-2222-222222222222';
  const KATEGORI_ID = '55555555-5555-5555-5555-555555555555';
  const MAPEL_ID = '66666666-6666-6666-6666-666666666666';

  beforeEach(async () => {
    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn(),
      onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
    };

    mockStorageService = {
      upload: jest.fn().mockResolvedValue('rpp/tenant/file.pdf'),
      delete: jest.fn().mockResolvedValue(undefined),
      getPresignedUrl: jest.fn().mockResolvedValue('https://r2.example.com/signed-url?token=abc'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RppService,
        { provide: DRIZZLE, useValue: mockDb },
        { provide: StorageService, useValue: mockStorageService },
      ],
    }).compile();

    service = module.get<RppService>(RppService);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('list', () => {
    it('should return paginated list of published RPP sorted by tanggal_publish DESC', async () => {
      const publishedRpp = [
        {
          id: 'aaa',
          judul: 'RPP Matematika',
          kontenType: 'richtext',
          tahunTerbit: 2024,
          tanggalPublish: new Date('2024-03-01'),
          updatedAt: new Date('2024-03-01'),
          guruNama: 'Pak Budi',
          mataPelajaranNama: 'Matematika',
          kategoriNama: 'Kurikulum Merdeka',
        },
        {
          id: 'bbb',
          judul: 'RPP Bahasa Indonesia',
          kontenType: 'file',
          tahunTerbit: 2024,
          tanggalPublish: new Date('2024-02-15'),
          updatedAt: new Date('2024-02-15'),
          guruNama: 'Bu Siti',
          mataPelajaranNama: 'Bahasa Indonesia',
          kategoriNama: 'Semester 1',
        },
      ];

      // The count query chain ends at .where(), data query chain ends at .offset()
      mockDb.offset = jest.fn().mockResolvedValue(publishedRpp);
      mockDb.where.mockResolvedValueOnce([{ count: 2 }]);

      const query: GetRppQueryDto = { page: 1, page_size: 15 };
      const result = await service.list(TENANT_ID, query);

      expect(result.data).toHaveLength(2);
      expect((result.data[0] as any).judul).toBe('RPP Matematika');
      expect((result.data[0] as any).guru_nama).toBe('Pak Budi');
      expect((result.data[0] as any).mata_pelajaran).toBe('Matematika');
      expect((result.data[0] as any).kategori).toBe('Kurikulum Merdeka');
      expect(result.meta.total_count).toBe(2);
      expect(result.meta.total_pages).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.page_size).toBe(15);
    });

    it('should calculate correct pagination meta for multiple pages', async () => {
      const items = Array.from({ length: 15 }, (_, i) => ({
        id: `id-${i}`,
        judul: `RPP ${i}`,
        kontenType: 'richtext',
        tahunTerbit: 2024,
        tanggalPublish: new Date(`2024-03-01`),
        updatedAt: new Date(`2024-03-01`),
        guruNama: 'Guru',
        mataPelajaranNama: 'Mapel',
        kategoriNama: 'Kategori',
      }));

      mockDb.offset = jest.fn().mockResolvedValue(items);
      mockDb.where.mockResolvedValueOnce([{ count: 45 }]);

      const query: GetRppQueryDto = { page: 1, page_size: 15 };
      const result = await service.list(TENANT_ID, query);

      expect(result.data).toHaveLength(15);
      expect(result.meta.total_count).toBe(45);
      expect(result.meta.total_pages).toBe(3);
      expect(result.meta.page).toBe(1);
    });

    it('should apply search filter on judul', async () => {
      const matchedRpp = [
        {
          id: 'matched',
          judul: 'RPP Matematika Kelas 3',
          kontenType: 'richtext',
          tahunTerbit: 2024,
          tanggalPublish: new Date('2024-03-01'),
          updatedAt: new Date('2024-03-01'),
          guruNama: 'Pak Budi',
          mataPelajaranNama: 'Matematika',
          kategoriNama: 'Kurikulum Merdeka',
        },
      ];

      mockDb.offset = jest.fn().mockResolvedValue(matchedRpp);
      mockDb.where.mockResolvedValueOnce([{ count: 1 }]);

      const query: GetRppQueryDto = { search: 'Matematika' };
      const result = await service.list(TENANT_ID, query);

      expect(result.data).toHaveLength(1);
      expect((result.data[0] as any).judul).toContain('Matematika');
    });

    it('should return empty result when no published RPP match filters', async () => {
      mockDb.offset = jest.fn().mockResolvedValue([]);
      mockDb.where.mockResolvedValueOnce([{ count: 0 }]);

      const query: GetRppQueryDto = {
        kategori: KATEGORI_ID,
        mapel: MAPEL_ID,
        tahun: 2024,
      };
      const result = await service.list(TENANT_ID, query);

      expect(result.data).toHaveLength(0);
      expect(result.meta.total_count).toBe(0);
      expect(result.meta.total_pages).toBe(0);
    });

    it('should use default page=1 and page_size=15 when not provided', async () => {
      mockDb.offset = jest.fn().mockResolvedValue([]);
      mockDb.where.mockResolvedValueOnce([{ count: 0 }]);

      const query: GetRppQueryDto = {};
      const result = await service.list(TENANT_ID, query);

      expect(result.meta.page).toBe(1);
      expect(result.meta.page_size).toBe(15);
    });

    it('should return empty data with correct meta for out-of-range page', async () => {
      mockDb.offset = jest.fn().mockResolvedValue([]);
      mockDb.where.mockResolvedValueOnce([{ count: 30 }]);

      const query: GetRppQueryDto = { page: 5, page_size: 15 };
      const result = await service.list(TENANT_ID, query);

      expect(result.data).toHaveLength(0);
      expect(result.meta.total_count).toBe(30);
      expect(result.meta.total_pages).toBe(2);
      expect(result.meta.page).toBe(5);
    });
  });

  describe('getDetail', () => {
    it('should return full detail of a richtext RPP including konten', async () => {
      const detailRow = {
        id: RPP_ID,
        judul: 'RPP Matematika Bab 1',
        kontenType: 'richtext',
        konten: '<p>Konten lengkap disini</p>',
        fileUrl: null,
        fileNama: null,
        fileSize: null,
        tahunTerbit: 2024,
        status: 'published',
        tanggalPublish: new Date('2024-03-01'),
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-03-01'),
        guruId: GURU_ID,
        guruNama: 'Pak Budi',
        mataPelajaranNama: 'Matematika',
        kategoriNama: 'Kurikulum Merdeka',
      };

      mockDb.where.mockResolvedValue([detailRow]);

      const result = await service.getDetail(TENANT_ID, RPP_ID);

      expect(result.id).toBe(RPP_ID);
      expect(result.judul).toBe('RPP Matematika Bab 1');
      expect(result.konten_type).toBe('richtext');
      expect(result.konten).toBe('<p>Konten lengkap disini</p>');
      expect(result.file_nama).toBeNull();
      expect(result.guru.id).toBe(GURU_ID);
      expect(result.guru.nama).toBe('Pak Budi');
      expect(result.mata_pelajaran).toBe('Matematika');
      expect(result.kategori).toBe('Kurikulum Merdeka');
    });

    it('should return file info for file-type RPP with konten=null', async () => {
      const detailRow = {
        id: RPP_ID,
        judul: 'RPP File Upload',
        kontenType: 'file',
        konten: null,
        fileUrl: 'rpp/tenant/doc.pdf',
        fileNama: 'modul-ajar.pdf',
        fileSize: 2048000,
        tahunTerbit: 2024,
        status: 'published',
        tanggalPublish: new Date('2024-03-01'),
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-03-01'),
        guruId: GURU_ID,
        guruNama: 'Bu Siti',
        mataPelajaranNama: 'Bahasa Indonesia',
        kategoriNama: 'Semester 2',
      };

      mockDb.where.mockResolvedValue([detailRow]);

      const result = await service.getDetail(TENANT_ID, RPP_ID);

      expect(result.konten_type).toBe('file');
      expect(result.konten).toBeNull();
      expect(result.file_nama).toBe('modul-ajar.pdf');
      expect(result.file_size).toBe(2048000);
    });

    it('should throw NotFoundException when RPP does not exist', async () => {
      mockDb.where.mockResolvedValue([]);

      await expect(service.getDetail(TENANT_ID, RPP_ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getDownloadUrl', () => {
    it('should return presigned URL for file-type published RPP with 5-min expiry', async () => {
      const fileRpp = {
        id: RPP_ID,
        kontenType: 'file',
        fileUrl: 'rpp/tenant/doc.pdf',
        fileNama: 'modul-ajar.pdf',
        status: 'published',
      };

      mockDb.where.mockResolvedValue([fileRpp]);

      const result = await service.getDownloadUrl(TENANT_ID, RPP_ID);

      expect(result.url).toContain('signed-url');
      expect(result.file_nama).toBe('modul-ajar.pdf');
      expect(mockStorageService.getPresignedUrl).toHaveBeenCalledWith('rpp/tenant/doc.pdf', 300);
    });

    it('should throw NotFoundException when RPP does not exist', async () => {
      mockDb.where.mockResolvedValue([]);

      await expect(service.getDownloadUrl(TENANT_ID, RPP_ID)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when RPP is not published (draft)', async () => {
      const draftRpp = {
        id: RPP_ID,
        kontenType: 'file',
        fileUrl: 'rpp/tenant/doc.pdf',
        fileNama: 'doc.pdf',
        status: 'draft',
      };

      mockDb.where.mockResolvedValue([draftRpp]);

      await expect(service.getDownloadUrl(TENANT_ID, RPP_ID)).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException for richtext RPP (PDF gen not available)', async () => {
      const richtextRpp = {
        id: RPP_ID,
        kontenType: 'richtext',
        fileUrl: null,
        fileNama: null,
        status: 'published',
      };

      mockDb.where.mockResolvedValue([richtextRpp]);

      await expect(service.getDownloadUrl(TENANT_ID, RPP_ID)).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when file-type RPP has no fileUrl', async () => {
      const brokenRpp = {
        id: RPP_ID,
        kontenType: 'file',
        fileUrl: null,
        fileNama: null,
        status: 'published',
      };

      mockDb.where.mockResolvedValue([brokenRpp]);

      await expect(service.getDownloadUrl(TENANT_ID, RPP_ID)).rejects.toThrow(NotFoundException);
    });
  });
});
