import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { Role } from '@edu/shared';
import { AbsensiService } from './absensi.service';
import { DrizzleService } from '@/drizzle/drizzle.service';
import { KonfigurasiService } from '@/modules/konfigurasi/konfigurasi.service';
import { JadwalService } from '@/modules/jadwal/jadwal.service';
import { TenantService } from '@/modules/tenant/tenant.service';
import { QUEUE_NAMES } from '@/modules/queue/queue.constants';
import { SyncAbsensiDto } from './dto';

/**
 * AbsensiService Unit Tests — Offline Sync (POST /absensi/sync)
 *
 * Tests conflict resolution per ADR-003:
 * - Rule 1: Kepala_sekolah edits always win (authority override)
 * - Rule 2: Server updated_at > client event_timestamp → server wins
 * - Rule 3: Client event_timestamp > server updated_at → client wins
 * - Clock skew protection: reject records > server_now + 5 minutes
 *
 * Requirements: 26.1–26.6
 */
describe('AbsensiService - syncAbsensi (Task 8.12)', () => {
  let service: AbsensiService;

  const tenantId = '11111111-1111-1111-1111-111111111111';
  const guruId = '22222222-2222-2222-2222-222222222222';
  const siswaId = '33333333-3333-3333-3333-333333333333';
  const kelasId = '44444444-4444-4444-4444-444444444444';
  const absensiId = '55555555-5555-5555-5555-555555555555';

  let mockDrizzleService: { db: any };
  let insertedValues: any[] = [];
  let updatedValues: any[] = [];

  /**
   * Creates a configurable mock DB for sync tests.
   * Supports:
   * - select → from(absensi) → first call returns existing record or empty
   * - select → from(absensiAudit) → second call returns audit record or empty
   * - insert → tracks inserted values
   * - update → tracks updated values
   */
  const createMockDb = (opts: {
    existingAbsensi?: { id: string; status: string; updatedAt: Date } | null;
    lastAuditRole?: string | null;
  }) => {
    const { existingAbsensi = null, lastAuditRole = null } = opts;
    insertedValues = [];
    updatedValues = [];

    let selectCallCount = 0;

    const db: any = {
      select: jest.fn().mockImplementation(() => ({
        from: jest.fn().mockImplementation(() => ({
          where: jest.fn().mockImplementation(() => {
            selectCallCount++;
            if (selectCallCount === 1) {
              // First select: get existing absensi record
              return Promise.resolve(existingAbsensi ? [existingAbsensi] : []);
            }
            // Second select: get last audit record (has orderBy chain)
            return {
              orderBy: jest.fn().mockImplementation(() => ({
                limit: jest.fn().mockResolvedValue(lastAuditRole ? [{ role: lastAuditRole }] : []),
              })),
            };
          }),
        })),
      })),
      insert: jest.fn().mockImplementation(() => ({
        values: jest.fn().mockImplementation((vals: any) => {
          insertedValues.push(vals);
          return Promise.resolve();
        }),
      })),
      update: jest.fn().mockImplementation(() => ({
        set: jest.fn().mockImplementation((vals: any) => {
          updatedValues.push(vals);
          return {
            where: jest.fn().mockResolvedValue(undefined),
          };
        }),
      })),
    };
    return db;
  };

  const mockKonfigurasiService = {
    getConfigByKey: jest.fn().mockResolvedValue({ value: 10 }),
  };

  const mockJadwalService = {
    isGuruPenggantiForClassOnDate: jest.fn().mockResolvedValue(false),
  };

  const mockQueue = {
    add: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    mockDrizzleService = { db: createMockDb({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AbsensiService,
        { provide: DrizzleService, useValue: mockDrizzleService },
        { provide: KonfigurasiService, useValue: mockKonfigurasiService },
        { provide: JadwalService, useValue: mockJadwalService },
        {
          provide: TenantService,
          useValue: { getHariKerja: jest.fn().mockResolvedValue('6_hari') },
        },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION), useValue: mockQueue },
        { provide: getQueueToken(QUEUE_NAMES.EXPORT), useValue: { add: jest.fn() } },
      ],
    }).compile();

    service = module.get<AbsensiService>(AbsensiService);
    jest.clearAllMocks();
  });

  // ─── Clock Skew Protection ──────────────────────────────────────────────

  /**
   * Requirement 26.3 (ADR-003): Records with event_timestamp > server_now + 5 minutes
   * should be rejected to prevent clock skew issues.
   */
  it('should reject records with event_timestamp > server_now + 5 minutes', async () => {
    const futureTime = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min in future
    const dto: SyncAbsensiDto = {
      records: [
        {
          siswa_id: siswaId,
          kelas_id: kelasId,
          tanggal: '2024-10-15',
          status: 'hadir',
          event_timestamp: futureTime,
        },
      ],
    };

    mockDrizzleService.db = createMockDb({});

    const result = await service.syncAbsensi(tenantId, guruId, dto);

    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].siswa_id).toBe(siswaId);
    expect(result.rejected[0].reason).toContain('Clock skew');
    expect(result.synced).toHaveLength(0);
    expect(result.conflicts).toHaveLength(0);
  });

  /**
   * Requirement 26.3: Records within 5-minute threshold should NOT be rejected.
   */
  it('should NOT reject records with event_timestamp within 5-minute threshold', async () => {
    const withinThreshold = new Date(Date.now() + 3 * 60 * 1000).toISOString(); // 3 min in future
    const dto: SyncAbsensiDto = {
      records: [
        {
          siswa_id: siswaId,
          kelas_id: kelasId,
          tanggal: '2024-10-15',
          status: 'hadir',
          event_timestamp: withinThreshold,
        },
      ],
    };

    mockDrizzleService.db = createMockDb({ existingAbsensi: null });

    const result = await service.syncAbsensi(tenantId, guruId, dto);

    expect(result.rejected).toHaveLength(0);
    expect(result.synced).toHaveLength(1);
  });

  // ─── New Record (No Conflict) ───────────────────────────────────────────

  /**
   * Requirement 26.2: When no existing record for (siswa_id, tanggal), insert and mark as synced.
   */
  it('should insert new records when no existing record exists', async () => {
    const eventTime = new Date(Date.now() - 60000).toISOString(); // 1 min ago
    const dto: SyncAbsensiDto = {
      records: [
        {
          siswa_id: siswaId,
          kelas_id: kelasId,
          tanggal: '2024-10-15',
          status: 'hadir',
          event_timestamp: eventTime,
        },
      ],
    };

    mockDrizzleService.db = createMockDb({ existingAbsensi: null });

    const result = await service.syncAbsensi(tenantId, guruId, dto);

    expect(result.synced).toHaveLength(1);
    expect(result.synced[0]).toBe(siswaId);
    expect(result.conflicts).toHaveLength(0);
    expect(result.rejected).toHaveLength(0);
    // Verify insert was called
    expect(insertedValues.length).toBeGreaterThan(0);
  });

  // ─── Rule 1: Authority Override ─────────────────────────────────────────

  /**
   * Requirement 26.3 (ADR-003 Rule 1): If existing record was last edited by
   * kepala_sekolah, server always wins regardless of timestamps.
   */
  it('should resolve conflict as server-wins when last edit was by kepala_sekolah (Rule 1)', async () => {
    const eventTime = new Date(Date.now() - 30000).toISOString(); // 30s ago (newer than server)
    const dto: SyncAbsensiDto = {
      records: [
        {
          siswa_id: siswaId,
          kelas_id: kelasId,
          tanggal: '2024-10-15',
          status: 'alpa',
          event_timestamp: eventTime,
        },
      ],
    };

    // Server record is older than client, but was edited by kepala_sekolah
    mockDrizzleService.db = createMockDb({
      existingAbsensi: {
        id: absensiId,
        status: 'izin',
        updatedAt: new Date(Date.now() - 120000), // 2 min ago (older)
      },
      lastAuditRole: Role.KEPALA_SEKOLAH,
    });

    const result = await service.syncAbsensi(tenantId, guruId, dto);

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].winner).toBe('server');
    expect(result.conflicts[0].reason).toContain('kepala_sekolah');
    expect(result.conflicts[0].server_value).toBe('izin');
    expect(result.synced).toHaveLength(0);
  });

  // ─── Rule 2: Server Newer ──────────────────────────────────────────────

  /**
   * Requirement 26.3 (ADR-003 Rule 2): If server updated_at > client event_timestamp,
   * server wins.
   */
  it('should resolve conflict as server-wins when server is newer (Rule 2)', async () => {
    const clientEventTime = new Date(Date.now() - 120000).toISOString(); // 2 min ago
    const dto: SyncAbsensiDto = {
      records: [
        {
          siswa_id: siswaId,
          kelas_id: kelasId,
          tanggal: '2024-10-15',
          status: 'alpa',
          event_timestamp: clientEventTime,
        },
      ],
    };

    // Server record updated 30s ago (newer than client's 2 min ago)
    mockDrizzleService.db = createMockDb({
      existingAbsensi: {
        id: absensiId,
        status: 'sakit',
        updatedAt: new Date(Date.now() - 30000), // 30s ago
      },
      lastAuditRole: Role.GURU, // Not kepala_sekolah, so Rule 1 doesn't apply
    });

    const result = await service.syncAbsensi(tenantId, guruId, dto);

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].winner).toBe('server');
    expect(result.conflicts[0].reason).toContain('newer');
    expect(result.conflicts[0].server_value).toBe('sakit');
    expect(result.synced).toHaveLength(0);
  });

  // ─── Rule 3: Client Newer ──────────────────────────────────────────────

  /**
   * Requirement 26.3 (ADR-003 Rule 3): If client event_timestamp > server updated_at,
   * client wins and the record is updated.
   */
  it('should resolve conflict as client-wins when client is newer (Rule 3)', async () => {
    const clientEventTime = new Date(Date.now() - 30000).toISOString(); // 30s ago
    const dto: SyncAbsensiDto = {
      records: [
        {
          siswa_id: siswaId,
          kelas_id: kelasId,
          tanggal: '2024-10-15',
          status: 'alpa',
          event_timestamp: clientEventTime,
        },
      ],
    };

    // Server record updated 2 min ago (older than client's 30s ago)
    mockDrizzleService.db = createMockDb({
      existingAbsensi: {
        id: absensiId,
        status: 'hadir',
        updatedAt: new Date(Date.now() - 120000), // 2 min ago
      },
      lastAuditRole: Role.GURU, // Not kepala_sekolah
    });

    const result = await service.syncAbsensi(tenantId, guruId, dto);

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].winner).toBe('client');
    expect(result.conflicts[0].reason).toContain('newer');
    expect(result.conflicts[0].server_value).toBeUndefined();
    expect(result.synced).toHaveLength(0);
    // Verify update was called
    expect(updatedValues.length).toBeGreaterThan(0);
    expect(updatedValues[0].status).toBe('alpa');
  });

  /**
   * Requirement 26.3 (Rule 3): When client wins, an audit log entry should be written.
   */
  it('should write audit log when client wins conflict (Rule 3)', async () => {
    const clientEventTime = new Date(Date.now() - 30000).toISOString();
    const dto: SyncAbsensiDto = {
      records: [
        {
          siswa_id: siswaId,
          kelas_id: kelasId,
          tanggal: '2024-10-15',
          status: 'sakit',
          event_timestamp: clientEventTime,
        },
      ],
    };

    mockDrizzleService.db = createMockDb({
      existingAbsensi: {
        id: absensiId,
        status: 'hadir',
        updatedAt: new Date(Date.now() - 120000),
      },
      lastAuditRole: null, // No prior audit → rules 2/3 apply
    });

    await service.syncAbsensi(tenantId, guruId, dto);

    // Second insert should be audit log (first is update, which goes through update path)
    // The audit insert is after the update
    const auditInsert = insertedValues.find(
      (v) => v.absensiId && v.statusSebelum && v.statusSesudah,
    );
    expect(auditInsert).toBeDefined();
    expect(auditInsert.statusSebelum).toBe('hadir');
    expect(auditInsert.statusSesudah).toBe('sakit');
    expect(auditInsert.userId).toBe(guruId);
    expect(auditInsert.role).toBe(Role.GURU);
  });

  // ─── Batch Processing ──────────────────────────────────────────────────

  /**
   * Requirement 26.2: Multiple records in a single batch should be processed individually.
   */
  it('should process multiple records in a batch with mixed results', async () => {
    const validTime = new Date(Date.now() - 60000).toISOString(); // 1 min ago
    const futureTime = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min in future

    const dto: SyncAbsensiDto = {
      records: [
        {
          siswa_id: 'aaa11111-1111-1111-1111-111111111111',
          kelas_id: kelasId,
          tanggal: '2024-10-15',
          status: 'hadir',
          event_timestamp: validTime,
        },
        {
          siswa_id: 'bbb22222-2222-2222-2222-222222222222',
          kelas_id: kelasId,
          tanggal: '2024-10-15',
          status: 'alpa',
          event_timestamp: futureTime, // Will be rejected
        },
      ],
    };

    // Mock that returns no existing record for first, but second gets rejected by clock skew
    mockDrizzleService.db = createMockDb({ existingAbsensi: null });

    const result = await service.syncAbsensi(tenantId, guruId, dto);

    // First record: synced (no existing)
    expect(result.synced).toContain('aaa11111-1111-1111-1111-111111111111');
    // Second record: rejected (clock skew)
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].siswa_id).toBe('bbb22222-2222-2222-2222-222222222222');
  });

  // ─── Edge Cases ─────────────────────────────────────────────────────────

  /**
   * Edge case: Equal timestamps → server wins (tie-break avoids unnecessary writes).
   */
  it('should resolve equal timestamps as server-wins (tie-break)', async () => {
    const sameTime = new Date(Date.now() - 60000);
    const dto: SyncAbsensiDto = {
      records: [
        {
          siswa_id: siswaId,
          kelas_id: kelasId,
          tanggal: '2024-10-15',
          status: 'alpa',
          event_timestamp: sameTime.toISOString(),
        },
      ],
    };

    mockDrizzleService.db = createMockDb({
      existingAbsensi: {
        id: absensiId,
        status: 'hadir',
        updatedAt: sameTime, // Exact same time as client
      },
      lastAuditRole: null,
    });

    const result = await service.syncAbsensi(tenantId, guruId, dto);

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].winner).toBe('server');
    expect(result.conflicts[0].server_value).toBe('hadir');
  });

  /**
   * Rule 1 takes precedence over Rule 3: Even if client is much newer,
   * kepala_sekolah authority override always wins.
   */
  it('should prioritize kepala_sekolah override (Rule 1) over timestamp comparison (Rule 3)', async () => {
    // Client is 1 second ago (very recent), server is 1 hour ago
    const clientEventTime = new Date(Date.now() - 1000).toISOString();
    const dto: SyncAbsensiDto = {
      records: [
        {
          siswa_id: siswaId,
          kelas_id: kelasId,
          tanggal: '2024-10-15',
          status: 'hadir',
          event_timestamp: clientEventTime,
        },
      ],
    };

    mockDrizzleService.db = createMockDb({
      existingAbsensi: {
        id: absensiId,
        status: 'alpa',
        updatedAt: new Date(Date.now() - 3600000), // 1 hour ago (much older)
      },
      lastAuditRole: Role.KEPALA_SEKOLAH, // Authority override
    });

    const result = await service.syncAbsensi(tenantId, guruId, dto);

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].winner).toBe('server');
    expect(result.conflicts[0].reason).toContain('kepala_sekolah');
    expect(result.conflicts[0].server_value).toBe('alpa');
    // No update should have happened
    expect(updatedValues).toHaveLength(0);
  });

  /**
   * Response structure validation: synced contains siswa_ids, not absensi_ids.
   */
  it('should return correct response structure with synced IDs', async () => {
    const eventTime = new Date(Date.now() - 60000).toISOString();
    const dto: SyncAbsensiDto = {
      records: [
        {
          siswa_id: siswaId,
          kelas_id: kelasId,
          tanggal: '2024-10-15',
          status: 'hadir',
          event_timestamp: eventTime,
        },
      ],
    };

    mockDrizzleService.db = createMockDb({ existingAbsensi: null });

    const result = await service.syncAbsensi(tenantId, guruId, dto);

    expect(result).toHaveProperty('synced');
    expect(result).toHaveProperty('conflicts');
    expect(result).toHaveProperty('rejected');
    expect(Array.isArray(result.synced)).toBe(true);
    expect(Array.isArray(result.conflicts)).toBe(true);
    expect(Array.isArray(result.rejected)).toBe(true);
  });
});
