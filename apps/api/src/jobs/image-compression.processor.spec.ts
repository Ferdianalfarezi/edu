import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bull';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { StorageService } from '@/modules/storage/storage.service';
import {
  ImageCompressionProcessor,
  CompressBuktiTransferJobData,
} from './image-compression.processor';

// Mock sharp
const mockSharpInstance = {
  resize: jest.fn().mockReturnThis(),
  webp: jest.fn().mockReturnThis(),
  toBuffer: jest.fn(),
};
jest.mock('sharp', () => jest.fn(() => mockSharpInstance));

describe('ImageCompressionProcessor', () => {
  let processor: ImageCompressionProcessor;
  let mockDb: { update: jest.Mock };
  let mockStorageService: {
    download: jest.Mock;
    upload: jest.Mock;
    delete: jest.Mock;
  };

  const createUpdateChain = () => {
    const chain = {
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue(undefined),
    };
    return chain;
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockDb = {
      update: jest.fn(),
    };

    mockStorageService = {
      download: jest.fn(),
      upload: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImageCompressionProcessor,
        { provide: DRIZZLE, useValue: mockDb },
        { provide: StorageService, useValue: mockStorageService },
      ],
    }).compile();

    processor = module.get<ImageCompressionProcessor>(ImageCompressionProcessor);
  });

  const createJob = (
    data: Partial<CompressBuktiTransferJobData> = {},
  ): Job<CompressBuktiTransferJobData> =>
    ({
      id: 'job-1',
      name: 'compress-bukti-transfer',
      data: {
        transaksi_id: 'txn-uuid-1',
        storage_path: 'bukti-transfer/tenant-1/tagihan-1/proof.png',
        tenant_id: 'tenant-uuid-1',
        tagihan_id: 'tagihan-uuid-1',
        ...data,
      },
      attemptsMade: 0,
      processedOn: Date.now(),
    }) as unknown as Job<CompressBuktiTransferJobData>;

  describe('handleCompressBuktiTransfer', () => {
    it('should download, compress to WebP, upload, update DB, and delete original', async () => {
      const originalBuffer = Buffer.from('original-image-data');
      const compressedBuffer = Buffer.from('compressed-webp-data');

      mockStorageService.download.mockResolvedValue(originalBuffer);
      mockSharpInstance.toBuffer.mockResolvedValue(compressedBuffer);
      mockStorageService.upload.mockResolvedValue('bukti-transfer/tenant-1/tagihan-1/proof.webp');
      const updateChain = createUpdateChain();
      mockDb.update.mockReturnValue(updateChain);
      mockStorageService.delete.mockResolvedValue(undefined);

      const job = createJob();
      await processor.handleCompressBuktiTransfer(job);

      // 1. Downloaded original
      expect(mockStorageService.download).toHaveBeenCalledWith(
        'bukti-transfer/tenant-1/tagihan-1/proof.png',
      );

      // 2. Compressed with sharp
      const sharp = require('sharp');
      expect(sharp).toHaveBeenCalledWith(originalBuffer);
      expect(mockSharpInstance.resize).toHaveBeenCalledWith({
        width: 1920,
        withoutEnlargement: true,
      });
      expect(mockSharpInstance.webp).toHaveBeenCalledWith({ quality: 80 });

      // 3. Uploaded compressed WebP
      expect(mockStorageService.upload).toHaveBeenCalledWith(
        'bukti-transfer/tenant-1/tagihan-1/proof.webp',
        compressedBuffer,
        'image/webp',
      );

      // 4. Updated DB record
      expect(mockDb.update).toHaveBeenCalled();
      expect(updateChain.set).toHaveBeenCalledWith({
        buktiTransferUrl: 'bukti-transfer/tenant-1/tagihan-1/proof.webp',
      });

      // 5. Deleted original
      expect(mockStorageService.delete).toHaveBeenCalledWith(
        'bukti-transfer/tenant-1/tagihan-1/proof.png',
      );
    });

    it('should handle JPEG extension correctly', async () => {
      const originalBuffer = Buffer.from('jpeg-image');
      const compressedBuffer = Buffer.from('webp-output');

      mockStorageService.download.mockResolvedValue(originalBuffer);
      mockSharpInstance.toBuffer.mockResolvedValue(compressedBuffer);
      mockStorageService.upload.mockResolvedValue('bukti-transfer/tenant-1/tagihan-1/photo.webp');
      const updateChain = createUpdateChain();
      mockDb.update.mockReturnValue(updateChain);
      mockStorageService.delete.mockResolvedValue(undefined);

      const job = createJob({
        storage_path: 'bukti-transfer/tenant-1/tagihan-1/photo.jpeg',
      });
      await processor.handleCompressBuktiTransfer(job);

      expect(mockStorageService.upload).toHaveBeenCalledWith(
        'bukti-transfer/tenant-1/tagihan-1/photo.webp',
        compressedBuffer,
        'image/webp',
      );
      expect(mockStorageService.delete).toHaveBeenCalledWith(
        'bukti-transfer/tenant-1/tagihan-1/photo.jpeg',
      );
    });

    it('should propagate errors when download fails (triggers Bull retry)', async () => {
      mockStorageService.download.mockRejectedValue(new Error('R2 download failed'));

      const job = createJob();
      await expect(processor.handleCompressBuktiTransfer(job)).rejects.toThrow(
        'R2 download failed',
      );

      // Should not have proceeded to compression or upload
      expect(mockStorageService.upload).not.toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
      expect(mockStorageService.delete).not.toHaveBeenCalled();
    });

    it('should propagate errors when sharp compression fails', async () => {
      const originalBuffer = Buffer.from('corrupt-image');
      mockStorageService.download.mockResolvedValue(originalBuffer);
      mockSharpInstance.toBuffer.mockRejectedValue(
        new Error('Input buffer contains unsupported image format'),
      );

      const job = createJob();
      await expect(processor.handleCompressBuktiTransfer(job)).rejects.toThrow(
        'Input buffer contains unsupported image format',
      );

      // Should not have uploaded or deleted
      expect(mockStorageService.upload).not.toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
      expect(mockStorageService.delete).not.toHaveBeenCalled();
    });
  });

  describe('replaceExtension', () => {
    it('should replace .png with .webp', () => {
      expect(processor.replaceExtension('path/to/file.png', '.webp')).toBe('path/to/file.webp');
    });

    it('should replace .jpeg with .webp', () => {
      expect(processor.replaceExtension('path/to/image.jpeg', '.webp')).toBe('path/to/image.webp');
    });

    it('should replace .jpg with .webp', () => {
      expect(processor.replaceExtension('folder/sub/proof.jpg', '.webp')).toBe(
        'folder/sub/proof.webp',
      );
    });

    it('should append .webp if no extension exists', () => {
      expect(processor.replaceExtension('path/to/file', '.webp')).toBe('path/to/file.webp');
    });

    it('should handle paths with multiple dots correctly', () => {
      expect(processor.replaceExtension('bukti-transfer/tenant.1/img.v2.png', '.webp')).toBe(
        'bukti-transfer/tenant.1/img.v2.webp',
      );
    });
  });
});
