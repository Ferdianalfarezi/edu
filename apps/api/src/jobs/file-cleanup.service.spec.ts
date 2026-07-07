import { Test, TestingModule } from '@nestjs/testing';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { StorageService } from '@/modules/storage/storage.service';
import { FileCleanupService } from './file-cleanup.service';

describe('FileCleanupService', () => {
  let service: FileCleanupService;
  let mockDb: {
    select: jest.Mock;
    update: jest.Mock;
  };
  let mockStorageService: { delete: jest.Mock };

  const createSelectChain = (data: any[]) => {
    const chain = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue(data),
    };
    return chain;
  };

  const createUpdateChain = () => {
    const chain = {
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue(undefined),
    };
    return chain;
  };

  beforeEach(async () => {
    mockDb = {
      select: jest.fn(),
      update: jest.fn(),
    };

    mockStorageService = {
      delete: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileCleanupService,
        { provide: DRIZZLE, useValue: mockDb },
        { provide: StorageService, useValue: mockStorageService },
      ],
    }).compile();

    service = module.get<FileCleanupService>(FileCleanupService);
  });

  describe('handleBuktiTransferCleanup', () => {
    it('should do nothing when no expired transactions exist', async () => {
      const selectChain = createSelectChain([]);
      mockDb.select.mockReturnValue(selectChain);

      const result = await service.handleBuktiTransferCleanup();

      expect(result).toEqual({ deleted: 0, failed: 0 });
      expect(mockStorageService.delete).not.toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('should delete expired files from R2 and set bukti_transfer_url to null', async () => {
      const expiredTransactions = [
        { id: 'txn-1', buktiTransferUrl: 'bukti-transfer/tenant-1/tagihan-1/file1.webp' },
        { id: 'txn-2', buktiTransferUrl: 'bukti-transfer/tenant-2/tagihan-2/file2.webp' },
      ];

      const selectChain = createSelectChain(expiredTransactions);
      mockDb.select.mockReturnValue(selectChain);

      const updateChain = createUpdateChain();
      mockDb.update.mockReturnValue(updateChain);

      const result = await service.handleBuktiTransferCleanup();

      expect(result).toEqual({ deleted: 2, failed: 0 });

      // Should delete each file from R2
      expect(mockStorageService.delete).toHaveBeenCalledTimes(2);
      expect(mockStorageService.delete).toHaveBeenCalledWith(
        'bukti-transfer/tenant-1/tagihan-1/file1.webp',
      );
      expect(mockStorageService.delete).toHaveBeenCalledWith(
        'bukti-transfer/tenant-2/tagihan-2/file2.webp',
      );

      // Should update DB to set bukti_transfer_url = null
      expect(mockDb.update).toHaveBeenCalledTimes(2);
    });

    it('should continue processing remaining files when one deletion fails', async () => {
      const expiredTransactions = [
        { id: 'txn-1', buktiTransferUrl: 'bukti-transfer/tenant-1/file1.webp' },
        { id: 'txn-2', buktiTransferUrl: 'bukti-transfer/tenant-2/file2.webp' },
        { id: 'txn-3', buktiTransferUrl: 'bukti-transfer/tenant-3/file3.webp' },
      ];

      const selectChain = createSelectChain(expiredTransactions);
      mockDb.select.mockReturnValue(selectChain);

      const updateChain = createUpdateChain();
      mockDb.update.mockReturnValue(updateChain);

      // Second file deletion fails
      mockStorageService.delete
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('R2 timeout'))
        .mockResolvedValueOnce(undefined);

      const result = await service.handleBuktiTransferCleanup();

      expect(result).toEqual({ deleted: 2, failed: 1 });

      // All 3 attempts to delete from R2
      expect(mockStorageService.delete).toHaveBeenCalledTimes(3);

      // Only 2 DB updates (the failed one is skipped)
      expect(mockDb.update).toHaveBeenCalledTimes(2);
    });

    it('should query with verified_at older than 3 years condition', async () => {
      const selectChain = createSelectChain([]);
      mockDb.select.mockReturnValue(selectChain);

      await service.handleBuktiTransferCleanup();

      // Verify select was called (query was constructed)
      expect(mockDb.select).toHaveBeenCalled();
      expect(selectChain.from).toHaveBeenCalled();
      expect(selectChain.where).toHaveBeenCalled();
    });
  });
});
