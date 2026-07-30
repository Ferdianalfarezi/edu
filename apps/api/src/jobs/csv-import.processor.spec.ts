import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bull';
import { UserService } from '@/modules/user/user.service';
import { SiswaService } from '@/modules/siswa/siswa.service';
import {
  CsvImportProcessor,
  BulkImportGuruJobData,
  BulkImportSiswaJobData,
} from './csv-import.processor';

describe('CsvImportProcessor', () => {
  let processor: CsvImportProcessor;
  let mockUserService: { bulkImportUsers: jest.Mock };
  let mockSiswaService: { bulkImportSiswa: jest.Mock };

  beforeEach(async () => {
    mockUserService = {
      bulkImportUsers: jest.fn(),
    };

    mockSiswaService = {
      bulkImportSiswa: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CsvImportProcessor,
        { provide: UserService, useValue: mockUserService },
        { provide: SiswaService, useValue: mockSiswaService },
      ],
    }).compile();

    processor = module.get<CsvImportProcessor>(CsvImportProcessor);
  });

  const createGuruJob = (data: Partial<BulkImportGuruJobData> = {}): Job<BulkImportGuruJobData> =>
    ({
      id: 'job-guru-1',
      data: {
        type: 'bulk-import-guru',
        tenant_id: 'tenant-1',
        csv_content: 'nama,email\nJohn,john@example.com',
        ...data,
      },
      attemptsMade: 0,
    }) as unknown as Job<BulkImportGuruJobData>;

  const createSiswaJob = (
    data: Partial<BulkImportSiswaJobData> = {},
  ): Job<BulkImportSiswaJobData> =>
    ({
      id: 'job-siswa-1',
      data: {
        type: 'bulk-import-siswa',
        tenant_id: 'tenant-1',
        csv_content: 'nama,nisn\nAndi,1234567890',
        processed_by_user_id: 'admin-user-1',
        ...data,
      },
      attemptsMade: 0,
    }) as unknown as Job<BulkImportSiswaJobData>;

  describe('handleBulkImportGuru', () => {
    it('should delegate to UserService.bulkImportUsers with correct params', async () => {
      const job = createGuruJob();
      mockUserService.bulkImportUsers.mockResolvedValue({
        created: 1,
        skipped: [],
        total: 1,
      });

      await processor.handleBulkImportGuru(job);

      expect(mockUserService.bulkImportUsers).toHaveBeenCalledWith(
        'tenant-1',
        'nama,email\nJohn,john@example.com',
      );
    });

    it('should skip processing if CSV content is empty', async () => {
      const job = createGuruJob({ csv_content: '' });

      await processor.handleBulkImportGuru(job);

      expect(mockUserService.bulkImportUsers).not.toHaveBeenCalled();
    });

    it('should skip processing if CSV content is whitespace only', async () => {
      const job = createGuruJob({ csv_content: '   \n  ' });

      await processor.handleBulkImportGuru(job);

      expect(mockUserService.bulkImportUsers).not.toHaveBeenCalled();
    });

    it('should propagate errors from UserService for retry handling', async () => {
      const job = createGuruJob();
      mockUserService.bulkImportUsers.mockRejectedValue(new Error('Database connection failed'));

      await expect(processor.handleBulkImportGuru(job)).rejects.toThrow(
        'Database connection failed',
      );
    });
  });

  describe('handleBulkImportSiswa', () => {
    it('should delegate to SiswaService.bulkImportSiswa with correct params', async () => {
      const job = createSiswaJob();
      mockSiswaService.bulkImportSiswa.mockResolvedValue({
        created: 1,
        skipped: [],
        total: 1,
      });

      await processor.handleBulkImportSiswa(job);

      expect(mockSiswaService.bulkImportSiswa).toHaveBeenCalledWith(
        'tenant-1',
        'nama,nisn\nAndi,1234567890',
        'admin-user-1',
      );
    });

    it('should skip processing if CSV content is empty', async () => {
      const job = createSiswaJob({ csv_content: '' });

      await processor.handleBulkImportSiswa(job);

      expect(mockSiswaService.bulkImportSiswa).not.toHaveBeenCalled();
    });

    it('should propagate errors from SiswaService for retry handling', async () => {
      const job = createSiswaJob();
      mockSiswaService.bulkImportSiswa.mockRejectedValue(new Error('NISN validation failed'));

      await expect(processor.handleBulkImportSiswa(job)).rejects.toThrow('NISN validation failed');
    });
  });

  describe('handleDeadLetter', () => {
    it('should log dead letter with job context without throwing', async () => {
      const job = createGuruJob();
      (job as any).attemptsMade = 3;

      const error = new Error('Persistent failure');

      // Should not throw — dead letter handler logs only
      await expect((processor as any).handleDeadLetter(job, error)).resolves.toBeUndefined();
    });
  });
});
