import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bull';
import {
  ExportProcessor,
  ExportRekapAbsensiJobData,
  ExportRaporJobData,
  ExportTagihanJobData,
} from './export.processor';
import { StorageService } from '@/modules/storage/storage.service';

describe('ExportProcessor', () => {
  let processor: ExportProcessor;
  let mockStorageService: jest.Mocked<Pick<StorageService, 'upload'>>;

  beforeEach(async () => {
    mockStorageService = {
      upload: jest.fn().mockResolvedValue('uploaded-path'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ExportProcessor, { provide: StorageService, useValue: mockStorageService }],
    }).compile();

    processor = module.get<ExportProcessor>(ExportProcessor);
  });

  // ─── Helper to create mock Job ─────────────────────────────────────────

  function createMockJob<T>(data: T, id: string = 'job-001'): Job<T> {
    return {
      id,
      data,
      name: 'test-job',
      attemptsMade: 0,
      processedOn: Date.now(),
    } as unknown as Job<T>;
  }

  // ─── export-rekap-absensi ─────────────────────────────────────────────

  describe('handleExportRekapAbsensi', () => {
    const jobData: ExportRekapAbsensiJobData = {
      tenantId: 'tenant-abc',
      kelasId: 'kelas-123',
      bulan: 3,
      tahun: 2024,
      periode: 'bulanan',
      format: 'xlsx',
      requestedBy: 'user-xyz',
    };

    it('should upload file to correct R2 path and return result', async () => {
      const job = createMockJob(jobData, 'job-rekap-001');

      const result = await processor.handleExportRekapAbsensi(job);

      // Verify upload was called with correct path pattern
      expect(mockStorageService.upload).toHaveBeenCalledTimes(1);
      const [path, buffer, contentType] = mockStorageService.upload.mock.calls[0];

      expect(path).toMatch(/^exports\/tenant-abc\/job-rekap-001\//);
      expect(path).toContain('rekap-absensi');
      expect(path).toMatch(/\.xlsx$/);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(contentType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

      // Verify result structure
      expect(result.filePath).toBe(path);
      expect(result.filename).toContain('rekap-absensi');
      expect(result.format).toBe('xlsx');
      expect(result.size).toBeGreaterThan(0);
    });

    it('should generate CSV file when format is csv', async () => {
      const csvJobData: ExportRekapAbsensiJobData = { ...jobData, format: 'csv' };
      const job = createMockJob(csvJobData, 'job-rekap-csv');

      const result = await processor.handleExportRekapAbsensi(job);

      const [path, buffer, contentType] = mockStorageService.upload.mock.calls[0];

      expect(path).toMatch(/\.csv$/);
      expect(contentType).toBe('text/csv');
      expect(result.format).toBe('csv');

      // CSV content should be valid text
      const csvText = buffer.toString('utf-8');
      expect(csvText).toContain('type');
      expect(csvText).toContain('rekap-absensi');
    });

    it('should include job parameters in the generated file content', async () => {
      const job = createMockJob(jobData, 'job-content-check');

      await processor.handleExportRekapAbsensi(job);

      const [, buffer] = mockStorageService.upload.mock.calls[0];
      const content = JSON.parse(buffer.toString('utf-8'));

      expect(content.type).toBe('rekap-absensi');
      expect(content.parameters.tenantId).toBe('tenant-abc');
      expect(content.parameters.kelasId).toBe('kelas-123');
      expect(content.parameters.bulan).toBe(3);
      expect(content.parameters.tahun).toBe(2024);
      expect(content.parameters.periode).toBe('bulanan');
      expect(content.requestedBy).toBe('user-xyz');
      expect(content.generatedAt).toBeDefined();
    });
  });

  // ─── export-rapor ─────────────────────────────────────────────────────

  describe('handleExportRapor', () => {
    const jobData: ExportRaporJobData = {
      tenantId: 'tenant-def',
      kelasId: 'kelas-456',
      periode: 'semester_1',
      format: 'xlsx',
      requestedBy: 'user-wali',
    };

    it('should upload rapor export to correct R2 path', async () => {
      const job = createMockJob(jobData, 'job-rapor-001');

      const result = await processor.handleExportRapor(job);

      expect(mockStorageService.upload).toHaveBeenCalledTimes(1);
      const [path, buffer, contentType] = mockStorageService.upload.mock.calls[0];

      expect(path).toMatch(/^exports\/tenant-def\/job-rapor-001\//);
      expect(path).toContain('rapor');
      expect(buffer).toBeInstanceOf(Buffer);
      expect(contentType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

      expect(result.filePath).toBe(path);
      expect(result.filename).toContain('rapor');
      expect(result.format).toBe('xlsx');
      expect(result.size).toBeGreaterThan(0);
    });

    it('should include rapor parameters in file content', async () => {
      const job = createMockJob(jobData, 'job-rapor-content');

      await processor.handleExportRapor(job);

      const [, buffer] = mockStorageService.upload.mock.calls[0];
      const content = JSON.parse(buffer.toString('utf-8'));

      expect(content.type).toBe('rapor');
      expect(content.parameters.tenantId).toBe('tenant-def');
      expect(content.parameters.kelasId).toBe('kelas-456');
      expect(content.parameters.periode).toBe('semester_1');
      expect(content.requestedBy).toBe('user-wali');
    });
  });

  // ─── export-tagihan ───────────────────────────────────────────────────

  describe('handleExportTagihan', () => {
    const jobData: ExportTagihanJobData = {
      tenantId: 'tenant-ghi',
      format: 'xlsx',
      periode_bulan: 6,
      periode_tahun: 2024,
      requestedBy: 'user-bendahara',
    };

    it('should upload tagihan export to correct R2 path', async () => {
      const job = createMockJob(jobData, 'job-tagihan-001');

      const result = await processor.handleExportTagihan(job);

      expect(mockStorageService.upload).toHaveBeenCalledTimes(1);
      const [path, buffer, contentType] = mockStorageService.upload.mock.calls[0];

      expect(path).toMatch(/^exports\/tenant-ghi\/job-tagihan-001\//);
      expect(path).toContain('tagihan');
      expect(buffer).toBeInstanceOf(Buffer);
      expect(contentType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

      expect(result.filePath).toBe(path);
      expect(result.filename).toContain('tagihan');
      expect(result.format).toBe('xlsx');
      expect(result.size).toBeGreaterThan(0);
    });

    it('should include tagihan parameters in file content', async () => {
      const job = createMockJob(jobData, 'job-tagihan-content');

      await processor.handleExportTagihan(job);

      const [, buffer] = mockStorageService.upload.mock.calls[0];
      const content = JSON.parse(buffer.toString('utf-8'));

      expect(content.type).toBe('tagihan');
      expect(content.parameters.tenantId).toBe('tenant-ghi');
      expect(content.parameters.periode_bulan).toBe(6);
      expect(content.parameters.periode_tahun).toBe(2024);
      expect(content.requestedBy).toBe('user-bendahara');
    });

    it('should handle missing periode filters gracefully', async () => {
      const noPeriodeData: ExportTagihanJobData = {
        tenantId: 'tenant-ghi',
        format: 'csv',
        requestedBy: 'user-bendahara',
      };
      const job = createMockJob(noPeriodeData, 'job-tagihan-no-period');

      const result = await processor.handleExportTagihan(job);

      expect(mockStorageService.upload).toHaveBeenCalledTimes(1);
      const [path, , contentType] = mockStorageService.upload.mock.calls[0];

      expect(path).toMatch(/\.csv$/);
      expect(contentType).toBe('text/csv');
      expect(result.format).toBe('csv');
    });
  });

  // ─── Error handling ───────────────────────────────────────────────────

  describe('error handling', () => {
    it('should propagate storage upload errors', async () => {
      mockStorageService.upload.mockRejectedValue(new Error('R2 connection failed'));

      const job = createMockJob<ExportRekapAbsensiJobData>(
        {
          tenantId: 'tenant-err',
          kelasId: 'kelas-err',
          bulan: 1,
          tahun: 2024,
          periode: 'bulanan',
          format: 'xlsx',
          requestedBy: 'user-err',
        },
        'job-error',
      );

      await expect(processor.handleExportRekapAbsensi(job)).rejects.toThrow('R2 connection failed');
    });
  });
});
