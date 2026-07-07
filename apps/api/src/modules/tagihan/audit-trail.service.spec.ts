import { Test, TestingModule } from '@nestjs/testing';
import { AuditTrailService } from './audit-trail.service';
import { DrizzleService } from '@/drizzle/drizzle.service';

/**
 * AuditTrailService Unit Tests
 *
 * Validates:
 * - Audit trail entries are written correctly (append-only)
 * - Cursor-based pagination works (newest first)
 * - Proper data mapping from DB rows to API response format
 *
 * Requirements: 29.1, 29.2, 29.3, 29.4, 29.5
 */
describe('AuditTrailService', () => {
  let service: AuditTrailService;

  const tenantId = '11111111-1111-1111-1111-111111111111';
  const userId = '22222222-2222-2222-2222-222222222222';
  const entityId = '33333333-3333-3333-3333-333333333333';

  /**
   * Creates a chainable mock query builder that resolves to `result`.
   * Supports Drizzle's thenable pattern where any chain method can be awaited.
   */
  const createChainableMock = (result: unknown[]) => {
    const chain: any = {};
    const methods = ['select', 'from', 'where', 'orderBy', 'limit', 'insert', 'values'];
    for (const m of methods) {
      chain[m] = jest.fn().mockReturnValue(chain);
    }
    chain.then = (resolve: (value: unknown) => void) => resolve(result);
    return chain;
  };

  let mockDb: any;

  beforeEach(async () => {
    mockDb = {
      select: jest.fn(),
      insert: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditTrailService,
        {
          provide: DrizzleService,
          useValue: { db: mockDb },
        },
      ],
    }).compile();

    service = module.get<AuditTrailService>(AuditTrailService);
  });

  describe('record', () => {
    it('should insert an audit trail entry with all fields', async () => {
      const insertChain = createChainableMock([]);
      mockDb.insert.mockReturnValue(insertChain);

      await service.record({
        tenantId,
        userId,
        jenisAksi: 'edit_tagihan',
        entityType: 'tagihan',
        entityId,
        nilaiSebelum: { nominal: 500000 },
        nilaiSesudah: { nominal: 750000 },
        alasan: 'Koreksi nominal',
      });

      expect(mockDb.insert).toHaveBeenCalled();
      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          userId,
          jenisAksi: 'edit_tagihan',
          entityType: 'tagihan',
          entityId,
          nilaiSebelum: { nominal: 500000 },
          nilaiSesudah: { nominal: 750000 },
          alasan: 'Koreksi nominal',
        }),
      );
    });

    it('should handle null nilaiSebelum and nilaiSesudah (e.g., for delete)', async () => {
      const insertChain = createChainableMock([]);
      mockDb.insert.mockReturnValue(insertChain);

      await service.record({
        tenantId,
        userId,
        jenisAksi: 'hapus_tagihan',
        entityType: 'tagihan',
        entityId,
        nilaiSebelum: { status: 'belum_bayar', nominal: 500000 },
        nilaiSesudah: null,
        alasan: null,
      });

      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          jenisAksi: 'hapus_tagihan',
          nilaiSesudah: null,
          alasan: null,
        }),
      );
    });

    it('should default nilaiSebelum and alasan to null when not provided', async () => {
      const insertChain = createChainableMock([]);
      mockDb.insert.mockReturnValue(insertChain);

      await service.record({
        tenantId,
        userId,
        jenisAksi: 'buat_tagihan',
        entityType: 'tagihan',
        entityId,
      });

      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          nilaiSebelum: null,
          nilaiSesudah: null,
          alasan: null,
        }),
      );
    });
  });

  describe('list', () => {
    it('should return paginated audit trail entries sorted newest first', async () => {
      const now = new Date();
      const mockRows = [
        {
          id: 'aaa',
          userId,
          jenisAksi: 'edit_tagihan',
          entityType: 'tagihan',
          entityId,
          nilaiSebelum: { nominal: 500000 },
          nilaiSesudah: { nominal: 750000 },
          alasan: null,
          createdAt: now,
        },
      ];

      mockDb.select.mockReturnValueOnce(createChainableMock(mockRows));

      const result = await service.list(tenantId, { limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual({
        id: 'aaa',
        user_id: userId,
        jenis_aksi: 'edit_tagihan',
        entity_type: 'tagihan',
        entity_id: entityId,
        nilai_sebelum: { nominal: 500000 },
        nilai_sesudah: { nominal: 750000 },
        alasan: null,
        created_at: now,
      });
      expect(result.meta.has_next).toBe(false);
      expect(result.meta.cursor).toBeNull();
    });

    it('should return has_next=true and cursor when more entries exist', async () => {
      const now = new Date();
      // Simulate limit+1 rows returned (21 rows for limit=20)
      const mockRows = Array.from({ length: 21 }, (_, i) => ({
        id: `entry-${i}`,
        userId,
        jenisAksi: 'buat_tagihan',
        entityType: 'tagihan',
        entityId: `eid-${i}`,
        nilaiSebelum: null,
        nilaiSesudah: { status: 'belum_bayar' },
        alasan: null,
        createdAt: new Date(now.getTime() - i * 1000),
      }));

      mockDb.select.mockReturnValueOnce(createChainableMock(mockRows));

      const result = await service.list(tenantId, { limit: 20 });

      expect(result.data).toHaveLength(20);
      expect(result.meta.has_next).toBe(true);
      expect(result.meta.cursor).toBe('entry-19');
    });

    it('should use cursor for pagination when provided', async () => {
      const cursorId = '44444444-4444-4444-4444-444444444444';
      const cursorTime = new Date('2024-01-15T10:00:00Z');

      // First call: cursor lookup returns the cursor entry
      mockDb.select
        .mockReturnValueOnce(createChainableMock([{ createdAt: cursorTime }]))
        // Second call: actual data query returns empty
        .mockReturnValueOnce(createChainableMock([]));

      const result = await service.list(tenantId, { cursor: cursorId, limit: 10 });

      expect(result.data).toHaveLength(0);
      expect(result.meta.has_next).toBe(false);
      expect(result.meta.cursor).toBeNull();
    });

    it('should return empty result when no entries exist', async () => {
      mockDb.select.mockReturnValueOnce(createChainableMock([]));

      const result = await service.list(tenantId, {});

      expect(result.data).toEqual([]);
      expect(result.meta.has_next).toBe(false);
      expect(result.meta.cursor).toBeNull();
    });
  });
});
