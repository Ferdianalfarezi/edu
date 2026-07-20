import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateTahunAjaranDto } from '../dto/create-tahun-ajaran.dto';
import { selectSource, TahunAjaranCandidate } from '../select-source';

/**
 * Unit tests for DTO validation and service edge cases.
 *
 * **Validates: Requirements 4.1, 4.2, 6.1, 6.2, 6.3**
 */

describe('CreateTahunAjaranDto validation — generate_kelas field', () => {
  const validPayload = {
    nama: '2025/2026',
    tanggal_mulai: '2025-07-14',
    tanggal_selesai: '2026-06-30',
  };

  it('accepts generate_kelas = true', async () => {
    const dto = plainToInstance(CreateTahunAjaranDto, {
      ...validPayload,
      generate_kelas: true,
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('accepts generate_kelas = false', async () => {
    const dto = plainToInstance(CreateTahunAjaranDto, {
      ...validPayload,
      generate_kelas: false,
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('accepts generate_kelas = undefined (field omitted)', async () => {
    const dto = plainToInstance(CreateTahunAjaranDto, validPayload);
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('rejects non-boolean generate_kelas (string "yes")', async () => {
    const dto = plainToInstance(CreateTahunAjaranDto, {
      ...validPayload,
      generate_kelas: 'yes',
    });
    const errors = await validate(dto);
    const kelasError = errors.find((e) => e.property === 'generate_kelas');
    expect(kelasError).toBeDefined();
  });

  it('rejects non-boolean generate_kelas (number 1)', async () => {
    const dto = plainToInstance(CreateTahunAjaranDto, {
      ...validPayload,
      generate_kelas: 1,
    });
    const errors = await validate(dto);
    const kelasError = errors.find((e) => e.property === 'generate_kelas');
    expect(kelasError).toBeDefined();
  });
});

describe('selectSource — edge cases for findSourceTahunAjaran logic', () => {
  it('returns null for empty candidate array (empty tenant — no prior tahun ajaran)', () => {
    const result = selectSource([], 'new-tahun-ajaran-id');
    expect(result).toBeNull();
  });

  it('returns null when all candidates have kelasCount = 0 (no prior tahun ajaran with kelas)', () => {
    const candidates: TahunAjaranCandidate[] = [
      {
        id: '1',
        tanggalMulai: '2024-07-01',
        createdAt: new Date('2024-01-01'),
        kelasCount: 0,
        status: 'aktif',
      },
      {
        id: '2',
        tanggalMulai: '2023-07-01',
        createdAt: new Date('2023-01-01'),
        kelasCount: 0,
        status: 'nonaktif',
      },
    ];
    const result = selectSource(candidates, 'new-id');
    expect(result).toBeNull();
  });

  it('returns null when the only candidate with kelas is the excluded one (newly created)', () => {
    const candidates: TahunAjaranCandidate[] = [
      {
        id: 'excluded-id',
        tanggalMulai: '2024-07-01',
        createdAt: new Date('2024-01-01'),
        kelasCount: 5,
        status: 'aktif',
      },
      {
        id: '2',
        tanggalMulai: '2023-07-01',
        createdAt: new Date('2023-01-01'),
        kelasCount: 0,
        status: 'disiapkan',
      },
    ];
    const result = selectSource(candidates, 'excluded-id');
    expect(result).toBeNull();
  });

  describe('tenant isolation — selectSource operates on pre-filtered (same-tenant) candidates', () => {
    it('only considers candidates passed to it (caller ensures tenant filtering)', () => {
      // selectSource is a pure function that operates on candidates already filtered
      // by tenant_id. This test documents and verifies that assumption:
      // if only same-tenant candidates are passed, the result is scoped correctly.
      const sameTenantCandidates: TahunAjaranCandidate[] = [
        {
          id: 'tenant-a-1',
          tanggalMulai: '2024-07-01',
          createdAt: new Date('2024-01-01'),
          kelasCount: 3,
          status: 'aktif',
        },
        {
          id: 'tenant-a-2',
          tanggalMulai: '2023-07-01',
          createdAt: new Date('2023-01-01'),
          kelasCount: 2,
          status: 'nonaktif',
        },
      ];

      const result = selectSource(sameTenantCandidates, 'new-id');
      expect(result).not.toBeNull();
      // Should pick the most recent (2024-07-01) which belongs to same tenant
      expect(result!.id).toBe('tenant-a-1');
    });

    it('does not mix records from different tenants when called correctly', () => {
      // Simulate what happens when the service correctly passes only
      // tenant B's candidates — even if tenant A has more recent records,
      // they are never passed to selectSource.
      const tenantBCandidates: TahunAjaranCandidate[] = [
        {
          id: 'tenant-b-1',
          tanggalMulai: '2022-07-01',
          createdAt: new Date('2022-01-01'),
          kelasCount: 4,
          status: 'aktif',
        },
      ];

      const result = selectSource(tenantBCandidates, 'new-id');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('tenant-b-1');
      // Even though tenant A might have more recent data, it's never considered
    });
  });
});
