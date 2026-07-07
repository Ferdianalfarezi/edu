import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { StorageService } from '@/modules/storage/storage.service';
import { RppService } from './rpp.service';
import { CreateRppDto } from './dto/create-rpp.dto';
import { UpdateRppDto } from './dto/update-rpp.dto';

describe('RppService', () => {
  let service: RppService;
  let mockDb: any;
  let mockStorageService: jest.Mocked<Partial<StorageService>>;

  const TENANT_ID = '11111111-1111-1111-1111-111111111111';
  const GURU_ID = '22222222-2222-2222-2222-222222222222';
  const OTHER_GURU_ID = '33333333-3333-3333-3333-333333333333';
  const RPP_ID = '44444444-4444-4444-4444-444444444444';
  const KATEGORI_ID = '55555555-5555-5555-5555-555555555555';
  const MAPEL_ID = '66666666-6666-6666-6666-666666666666';
  const FAVORIT_ID = '77777777-7777-7777-7777-777777777777';

  /** Helper to create a fresh chainable mock per test */
  function createMockDb() {
    const chain: any = {};
    chain.select = jest.fn().mockReturnValue(chain);
    chain.from = jest.fn().mockReturnValue(chain);
    chain.where = jest.fn().mockResolvedValue([]);
    chain.insert = jest.fn().mockReturnValue(chain);
    chain.values = jest.fn().mockReturnValue(chain);
    chain.returning = jest.fn().mockResolvedValue([]);
    chain.onConflictDoNothing = jest.fn().mockResolvedValue(undefined);
    chain.update = jest.fn().mockReturnValue(chain);
    chain.set = jest.fn().mockReturnValue(chain);
    chain.delete = jest.fn().mockReturnValue(chain);
    chain.innerJoin = jest.fn().mockReturnValue(chain);
    chain.orderBy = jest.fn().mockResolvedValue([]);
    return chain;
  }

  beforeEach(async () => {
    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn(),
      onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockResolvedValue([]),
    };

    mockStorageService = {
      upload: jest.fn().mockResolvedValue('rpp/tenant/1234-file.pdf'),
      delete: jest.fn().mockResolvedValue(undefined),
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

  describe('create', () => {
    it('should create a richtext RPP with auto-created kategori and published status', async () => {
      const dto: CreateRppDto = {
        judul: 'Matematika Dasar Bab 1',
        mata_pelajaran_id: MAPEL_ID,
        kategori: 'Kurikulum Merdeka',
        tahun_terbit: 2024,
        konten_type: 'richtext',
        konten: '<p>Isi materi</p>',
        status: 'published',
      };

      // resolveKategori: onConflictDoNothing then select
      mockDb.onConflictDoNothing.mockResolvedValue(undefined);
      mockDb.where.mockResolvedValueOnce([{ id: KATEGORI_ID, nama: 'Kurikulum Merdeka' }]);

      // insert returning
      const createdRpp = {
        id: RPP_ID,
        tenantId: TENANT_ID,
        guruId: GURU_ID,
        mataPelajaranId: MAPEL_ID,
        kategoriId: KATEGORI_ID,
        judul: dto.judul,
        kontenType: 'richtext',
        konten: dto.konten,
        fileUrl: null,
        fileNama: null,
        fileSize: null,
        tahunTerbit: 2024,
        status: 'published',
        tanggalPublish: expect.any(Date),
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      };
      mockDb.returning.mockResolvedValue([createdRpp]);

      const result = await service.create(TENANT_ID, GURU_ID, dto);

      expect(result).toEqual(createdRpp);
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockStorageService.upload).not.toHaveBeenCalled();
    });

    it('should create a file-based RPP and upload to R2', async () => {
      const dto: CreateRppDto = {
        judul: 'RPP Bahasa Indonesia',
        mata_pelajaran_id: MAPEL_ID,
        kategori: 'Semester 1',
        tahun_terbit: 2024,
        konten_type: 'file',
        status: 'draft',
      };

      const mockFile: Express.Multer.File = {
        originalname: 'rpp-bahasa.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from('fake-pdf'),
        size: 1024 * 1024, // 1MB
      } as Express.Multer.File;

      // resolveKategori
      mockDb.onConflictDoNothing.mockResolvedValue(undefined);
      mockDb.where.mockResolvedValueOnce([{ id: KATEGORI_ID, nama: 'Semester 1' }]);

      const createdRpp = {
        id: RPP_ID,
        tenantId: TENANT_ID,
        guruId: GURU_ID,
        mataPelajaranId: MAPEL_ID,
        kategoriId: KATEGORI_ID,
        judul: dto.judul,
        kontenType: 'file',
        konten: null,
        fileUrl: 'rpp/tenant/1234-rpp-bahasa.pdf',
        fileNama: 'rpp-bahasa.pdf',
        fileSize: 1024 * 1024,
        tahunTerbit: 2024,
        status: 'draft',
        tanggalPublish: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockDb.returning.mockResolvedValue([createdRpp]);

      const result = await service.create(TENANT_ID, GURU_ID, dto, mockFile);

      expect(result.fileUrl).toContain('rpp/');
      expect(result.fileNama).toBe('rpp-bahasa.pdf');
      expect(result.tanggalPublish).toBeNull();
      expect(mockStorageService.upload).toHaveBeenCalledWith(
        expect.stringContaining('rpp/'),
        mockFile.buffer,
        'application/pdf',
      );
    });

    it('should throw BadRequestException when konten_type is file but no file provided', async () => {
      const dto: CreateRppDto = {
        judul: 'RPP tanpa file',
        mata_pelajaran_id: MAPEL_ID,
        kategori: 'Test',
        tahun_terbit: 2024,
        konten_type: 'file',
        status: 'draft',
      };

      await expect(service.create(TENANT_ID, GURU_ID, dto)).rejects.toThrow(BadRequestException);
      await expect(service.create(TENANT_ID, GURU_ID, dto)).rejects.toThrow(
        'File wajib diupload untuk konten_type file',
      );
    });

    it('should throw BadRequestException when konten_type is richtext but no konten provided', async () => {
      const dto: CreateRppDto = {
        judul: 'RPP tanpa konten',
        mata_pelajaran_id: MAPEL_ID,
        kategori: 'Test',
        tahun_terbit: 2024,
        konten_type: 'richtext',
        konten: undefined,
        status: 'draft',
      };

      await expect(service.create(TENANT_ID, GURU_ID, dto)).rejects.toThrow(BadRequestException);
      await expect(service.create(TENANT_ID, GURU_ID, dto)).rejects.toThrow(
        'Konten wajib diisi untuk konten_type richtext',
      );
    });

    it('should throw BadRequestException for unsupported file MIME type', async () => {
      const dto: CreateRppDto = {
        judul: 'RPP file',
        mata_pelajaran_id: MAPEL_ID,
        kategori: 'Test',
        tahun_terbit: 2024,
        konten_type: 'file',
        status: 'draft',
      };

      const mockFile: Express.Multer.File = {
        originalname: 'image.jpg',
        mimetype: 'image/jpeg',
        buffer: Buffer.from('fake'),
        size: 1024,
      } as Express.Multer.File;

      await expect(service.create(TENANT_ID, GURU_ID, dto, mockFile)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(TENANT_ID, GURU_ID, dto, mockFile)).rejects.toThrow(
        'Format file tidak didukung',
      );
    });

    it('should throw BadRequestException when file exceeds 10MB', async () => {
      const dto: CreateRppDto = {
        judul: 'RPP besar',
        mata_pelajaran_id: MAPEL_ID,
        kategori: 'Test',
        tahun_terbit: 2024,
        konten_type: 'file',
        status: 'draft',
      };

      const mockFile: Express.Multer.File = {
        originalname: 'large.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.alloc(11 * 1024 * 1024), // 11MB
        size: 11 * 1024 * 1024,
      } as Express.Multer.File;

      await expect(service.create(TENANT_ID, GURU_ID, dto, mockFile)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(TENANT_ID, GURU_ID, dto, mockFile)).rejects.toThrow(
        'Ukuran file maksimal 10MB',
      );
    });
  });

  describe('update', () => {
    const existingRpp = {
      id: RPP_ID,
      tenantId: TENANT_ID,
      guruId: GURU_ID,
      mataPelajaranId: MAPEL_ID,
      kategoriId: KATEGORI_ID,
      judul: 'RPP Asli',
      kontenType: 'richtext',
      konten: '<p>Konten lama</p>',
      fileUrl: null,
      fileNama: null,
      fileSize: null,
      tahunTerbit: 2024,
      status: 'published',
      tanggalPublish: new Date('2024-01-01'),
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    };

    it('should update RPP fields and set tanggal_publish when publishing', async () => {
      // First select (find existing)
      mockDb.where.mockResolvedValueOnce([
        { ...existingRpp, status: 'draft', tanggalPublish: null },
      ]);

      const dto: UpdateRppDto = { judul: 'RPP Baru', status: 'published' };

      const updated = {
        ...existingRpp,
        judul: 'RPP Baru',
        status: 'published',
        tanggalPublish: new Date(),
        updatedAt: new Date(),
      };
      mockDb.returning.mockResolvedValue([updated]);

      const result = await service.update(TENANT_ID, GURU_ID, RPP_ID, dto);

      expect(result.judul).toBe('RPP Baru');
      expect(result.status).toBe('published');
      expect(result.tanggalPublish).toBeDefined();
    });

    it('should throw ForbiddenException when non-creator tries to edit', async () => {
      mockDb.where.mockResolvedValueOnce([existingRpp]);

      const dto: UpdateRppDto = { judul: 'Hacked' };

      await expect(service.update(TENANT_ID, OTHER_GURU_ID, RPP_ID, dto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw NotFoundException when RPP does not exist', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      const dto: UpdateRppDto = { judul: 'Tidak ada' };

      await expect(service.update(TENANT_ID, GURU_ID, RPP_ID, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should allow changing status from published to draft', async () => {
      mockDb.where.mockResolvedValueOnce([existingRpp]);

      const dto: UpdateRppDto = { status: 'draft' };

      const updated = { ...existingRpp, status: 'draft', updatedAt: new Date() };
      mockDb.returning.mockResolvedValue([updated]);

      const result = await service.update(TENANT_ID, GURU_ID, RPP_ID, dto);

      expect(result.status).toBe('draft');
    });
  });

  describe('delete', () => {
    const existingRpp = {
      id: RPP_ID,
      tenantId: TENANT_ID,
      guruId: GURU_ID,
      fileUrl: 'rpp/tenant/file.pdf',
      status: 'published',
    };

    it('should delete RPP, remove file from R2, and remove favorit references', async () => {
      // Select existing
      mockDb.where
        .mockResolvedValueOnce([existingRpp]) // find RPP
        .mockResolvedValueOnce(undefined); // delete favorit

      await service.delete(TENANT_ID, GURU_ID, RPP_ID);

      expect(mockStorageService.delete).toHaveBeenCalledWith('rpp/tenant/file.pdf');
      // db.delete called twice: once for rppFavorit, once for rpp
      expect(mockDb.delete).toHaveBeenCalledTimes(2);
    });

    it('should throw ForbiddenException when non-creator tries to delete', async () => {
      mockDb.where.mockResolvedValueOnce([existingRpp]);

      await expect(service.delete(TENANT_ID, OTHER_GURU_ID, RPP_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw NotFoundException when RPP does not exist', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      await expect(service.delete(TENANT_ID, GURU_ID, RPP_ID)).rejects.toThrow(NotFoundException);
    });

    it('should skip R2 delete when RPP has no file (richtext)', async () => {
      const richtextRpp = { ...existingRpp, fileUrl: null };
      mockDb.where.mockResolvedValueOnce([richtextRpp]).mockResolvedValueOnce(undefined);

      await service.delete(TENANT_ID, GURU_ID, RPP_ID);

      expect(mockStorageService.delete).not.toHaveBeenCalled();
    });
  });

  describe('toggleFavorite', () => {
    it('should add RPP to favorites when not yet favorited', async () => {
      // First call: find the RPP (it exists and is published)
      mockDb.where
        .mockResolvedValueOnce([{ id: RPP_ID, status: 'published' }]) // RPP exists
        .mockResolvedValueOnce([]); // No existing favorit

      // insert values resolves (no returning needed for INSERT into rppFavorit)
      mockDb.values.mockResolvedValueOnce(undefined);

      const result = await service.toggleFavorite(TENANT_ID, GURU_ID, RPP_ID);

      expect(result).toEqual({ favorited: true });
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should remove RPP from favorites when already favorited (toggle off)', async () => {
      // First call: find the RPP
      mockDb.where
        .mockResolvedValueOnce([{ id: RPP_ID, status: 'published' }]) // RPP exists
        .mockResolvedValueOnce([{ id: FAVORIT_ID }]) // Favorit exists
        .mockResolvedValueOnce(undefined); // delete where

      const result = await service.toggleFavorite(TENANT_ID, GURU_ID, RPP_ID);

      expect(result).toEqual({ favorited: false });
      expect(mockDb.delete).toHaveBeenCalled();
    });

    it('should throw NotFoundException when RPP does not exist', async () => {
      mockDb.where.mockResolvedValueOnce([]); // RPP not found

      await expect(service.toggleFavorite(TENANT_ID, GURU_ID, RPP_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when RPP is not published (draft)', async () => {
      mockDb.where.mockResolvedValueOnce([{ id: RPP_ID, status: 'draft' }]);

      await expect(service.toggleFavorite(TENANT_ID, GURU_ID, RPP_ID)).rejects.toThrow(
        BadRequestException,
      );
      mockDb.where.mockResolvedValueOnce([{ id: RPP_ID, status: 'draft' }]);
      await expect(service.toggleFavorite(TENANT_ID, GURU_ID, RPP_ID)).rejects.toThrow(
        'Hanya RPP yang berstatus published dapat difavoritkan',
      );
    });
  });

  describe('listFavorites', () => {
    it('should return list of favorited published RPP for the guru', async () => {
      const favoriteItems = [
        {
          favoritId: FAVORIT_ID,
          favoritCreatedAt: new Date('2024-06-01'),
          rppId: RPP_ID,
          judul: 'Matematika Bab 1',
          kontenType: 'richtext',
          tahunTerbit: 2024,
          status: 'published',
          tanggalPublish: new Date('2024-05-01'),
          guruId: OTHER_GURU_ID,
          mataPelajaranId: MAPEL_ID,
          kategoriId: KATEGORI_ID,
        },
      ];

      mockDb.orderBy.mockResolvedValueOnce(favoriteItems);

      const result = await service.listFavorites(TENANT_ID, GURU_ID);

      expect(result).toEqual(favoriteItems);
      expect(result).toHaveLength(1);
      expect(result[0].judul).toBe('Matematika Bab 1');
      expect(result[0].status).toBe('published');
    });

    it('should return empty array when guru has no favorites', async () => {
      mockDb.orderBy.mockResolvedValueOnce([]);

      const result = await service.listFavorites(TENANT_ID, GURU_ID);

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });

    it('should not include draft RPP in favorites list (hidden when reverted)', async () => {
      // The query itself filters by status='published' via the WHERE clause
      // so the mock returns empty (simulating that the draft RPP is excluded)
      mockDb.orderBy.mockResolvedValueOnce([]);

      const result = await service.listFavorites(TENANT_ID, GURU_ID);

      // Verify the inner join and where clause is used to filter
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.innerJoin).toHaveBeenCalled();
      expect(mockDb.where).toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });
});
