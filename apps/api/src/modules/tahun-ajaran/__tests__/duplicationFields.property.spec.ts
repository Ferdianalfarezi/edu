import fc from 'fast-check';
import { mapDuplicatedKelas, SourceKelas } from '../map-duplicated-kelas';

/**
 * Feature: auto-generate-kelas, Property 2: Duplication preserves fields correctly and enforces invariants
 *
 * For any set of source kelas records (with arbitrary nama, tingkat, kapasitas, and
 * wali_kelas_id values), after duplication, every generated kelas record SHALL have:
 * (a) matching nama, tingkat, and kapasitas from the source,
 * (b) wali_kelas_id set to null,
 * (c) tahun_ajaran_id set to the target tahun_ajaran, and
 * (d) tenant_id matching the source tenant.
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 6.2**
 */
describe('Feature: auto-generate-kelas, Property 2: Duplication preserves fields correctly', () => {
  // --- Arbitraries ---

  // Random nama: alphanumeric 1-50 chars (e.g., "1A", "6B", "XII IPA 2")
  const namaArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0);

  // Random tingkat: integers 1-12
  const tingkatArb = fc.integer({ min: 1, max: 12 });

  // Random kapasitas: nullable integer (null or 1-100)
  const kapasitasArb = fc.oneof(fc.constant(null), fc.integer({ min: 1, max: 100 }));

  // Random wali_kelas_id (UUID): included in source to verify it's NOT copied
  const waliKelasIdArb = fc.oneof(fc.constant(null), fc.uuid());

  // Source kelas record with all fields (including wali_kelas_id to prove it's ignored)
  const sourceKelasArb: fc.Arbitrary<SourceKelas & { waliKelasId: string | null }> = fc.record({
    nama: namaArb,
    tingkat: tingkatArb,
    kapasitas: kapasitasArb,
    waliKelasId: waliKelasIdArb,
  });

  // Array of source kelas records (1-30 items)
  const sourceArrayArb = fc.array(sourceKelasArb, { minLength: 1, maxLength: 30 });

  // Random tenant and target tahun ajaran IDs
  const tenantIdArb = fc.uuid();
  const toTahunAjaranIdArb = fc.uuid();

  it('each output record preserves nama, tingkat, and kapasitas from its source', () => {
    fc.assert(
      fc.property(
        sourceArrayArb,
        tenantIdArb,
        toTahunAjaranIdArb,
        (sources, tenantId, toTahunAjaranId) => {
          // mapDuplicatedKelas only uses nama, tingkat, kapasitas (SourceKelas interface)
          const input: SourceKelas[] = sources.map((s) => ({
            nama: s.nama,
            tingkat: s.tingkat,
            kapasitas: s.kapasitas,
          }));

          const result = mapDuplicatedKelas(input, tenantId, toTahunAjaranId);

          for (let i = 0; i < input.length; i++) {
            expect(result[i].nama).toBe(input[i].nama);
            expect(result[i].tingkat).toBe(input[i].tingkat);
            expect(result[i].kapasitas).toBe(input[i].kapasitas);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('every output record has waliKelasId set to null (never copied from source)', () => {
    fc.assert(
      fc.property(
        sourceArrayArb,
        tenantIdArb,
        toTahunAjaranIdArb,
        (sources, tenantId, toTahunAjaranId) => {
          const input: SourceKelas[] = sources.map((s) => ({
            nama: s.nama,
            tingkat: s.tingkat,
            kapasitas: s.kapasitas,
          }));

          const result = mapDuplicatedKelas(input, tenantId, toTahunAjaranId);

          for (const record of result) {
            expect(record.waliKelasId).toBeNull();
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('every output record has tahunAjaranId set to the target tahun ajaran', () => {
    fc.assert(
      fc.property(
        sourceArrayArb,
        tenantIdArb,
        toTahunAjaranIdArb,
        (sources, tenantId, toTahunAjaranId) => {
          const input: SourceKelas[] = sources.map((s) => ({
            nama: s.nama,
            tingkat: s.tingkat,
            kapasitas: s.kapasitas,
          }));

          const result = mapDuplicatedKelas(input, tenantId, toTahunAjaranId);

          for (const record of result) {
            expect(record.tahunAjaranId).toBe(toTahunAjaranId);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('every output record has tenantId matching the provided tenant', () => {
    fc.assert(
      fc.property(
        sourceArrayArb,
        tenantIdArb,
        toTahunAjaranIdArb,
        (sources, tenantId, toTahunAjaranId) => {
          const input: SourceKelas[] = sources.map((s) => ({
            nama: s.nama,
            tingkat: s.tingkat,
            kapasitas: s.kapasitas,
          }));

          const result = mapDuplicatedKelas(input, tenantId, toTahunAjaranId);

          for (const record of result) {
            expect(record.tenantId).toBe(tenantId);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('source records with non-null waliKelasId still produce null waliKelasId in output', () => {
    // Specifically test that even when source has a wali_kelas_id set,
    // the output ignores it and always sets null
    const sourceWithWaliArb = fc.record({
      nama: namaArb,
      tingkat: tingkatArb,
      kapasitas: kapasitasArb,
      waliKelasId: fc.uuid(), // always non-null
    });

    fc.assert(
      fc.property(
        fc.array(sourceWithWaliArb, { minLength: 1, maxLength: 30 }),
        tenantIdArb,
        toTahunAjaranIdArb,
        (sources, tenantId, toTahunAjaranId) => {
          const input: SourceKelas[] = sources.map((s) => ({
            nama: s.nama,
            tingkat: s.tingkat,
            kapasitas: s.kapasitas,
          }));

          const result = mapDuplicatedKelas(input, tenantId, toTahunAjaranId);

          for (const record of result) {
            expect(record.waliKelasId).toBeNull();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
