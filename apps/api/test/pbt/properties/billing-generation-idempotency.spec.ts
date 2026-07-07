/**
 * Property 8: Billing Generation Idempotency and Correctness
 *
 * For any billing generation request (per-month or per-year), the system SHALL create
 * exactly one tagihan per active student per month within the specified range, with
 * nominal matching the class configuration. If a tagihan already exists for a
 * student-month combination, it SHALL be skipped. Running generation multiple times
 * SHALL produce the same final state (no duplicates).
 *
 * **Validates: Requirements 9.1, 9.2, 9.3, 10.1, 10.2, 10.3, 10.4**
 *
 * Properties verified:
 * 1. Running generation twice with same parameters produces same total tagihan count
 *    (second run inserts 0)
 * 2. For N students × M months, exactly N×M tagihan records are generated on first run
 * 3. ON CONFLICT DO NOTHING ensures no duplicates for same (siswa_id, bulan, tahun)
 * 4. Each generated tagihan has correct nominal based on student's class tingkat
 * 5. Partial failure (some already exist) still creates the remaining ones
 *
 * Pure logic testing — simulates the idempotent generation behavior.
 */

import fc from 'fast-check';
import { PBT_CONFIG } from '../config';
import { arbitraryUuid, arbitraryRupiahAmount } from '../arbitraries/common';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StudentWithClass {
  id: string;
  kelas_id: string;
  tingkat: number;
}

interface TagihanRecord {
  tenant_id: string;
  siswa_id: string;
  bulan: number;
  tahun: number;
  nominal: number;
  status: 'belum_bayar';
  tanggal_jatuh_tempo: string;
}

interface GenerationResult {
  created: number;
  skipped: number;
  total_nominal: number;
}

// ─── Simulated Billing Store (ON CONFLICT DO NOTHING) ─────────────────────────

/**
 * Simulates the tagihan table with UNIQUE(siswa_id, bulan, tahun) constraint
 * and INSERT ... ON CONFLICT DO NOTHING behavior.
 */
class BillingStore {
  private records: TagihanRecord[] = [];

  /**
   * Batch insert with ON CONFLICT DO NOTHING semantics on (siswa_id, bulan, tahun).
   * Returns the records that were actually inserted (not conflicting).
   */
  insertBatch(values: TagihanRecord[]): TagihanRecord[] {
    const inserted: TagihanRecord[] = [];
    for (const record of values) {
      const exists = this.records.some(
        (existing) =>
          existing.siswa_id === record.siswa_id &&
          existing.bulan === record.bulan &&
          existing.tahun === record.tahun,
      );
      if (!exists) {
        this.records.push(record);
        inserted.push(record);
      }
      // ON CONFLICT DO NOTHING — silently skip duplicates
    }
    return inserted;
  }

  /** Query all records */
  getAll(): TagihanRecord[] {
    return [...this.records];
  }

  /** Query records by siswa_id */
  getBySiswa(siswaId: string): TagihanRecord[] {
    return this.records.filter((r) => r.siswa_id === siswaId);
  }

  /** Query records by (siswa_id, bulan, tahun) */
  getByKey(siswaId: string, bulan: number, tahun: number): TagihanRecord | undefined {
    return this.records.find(
      (r) => r.siswa_id === siswaId && r.bulan === bulan && r.tahun === tahun,
    );
  }

  /** Get total record count */
  get count(): number {
    return this.records.length;
  }
}

// ─── Simulated Billing Generation Logic ───────────────────────────────────────

/**
 * Simulates the processGeneration logic from TagihanService.
 * Generates tagihan for all active students across all specified months,
 * using ON CONFLICT DO NOTHING semantics.
 */
function generateBilling(
  store: BillingStore,
  tenantId: string,
  students: StudentWithClass[],
  months: { bulan: number; tahun: number }[],
  nominalConfig: Record<number, number>,
  jatuhTempoHari: number,
): GenerationResult {
  const values: TagihanRecord[] = [];

  for (const student of students) {
    const nominal = nominalConfig[student.tingkat] ?? 500000; // Default fallback
    for (const month of months) {
      values.push({
        tenant_id: tenantId,
        siswa_id: student.id,
        bulan: month.bulan,
        tahun: month.tahun,
        nominal,
        status: 'belum_bayar',
        tanggal_jatuh_tempo: `${month.tahun}-${String(month.bulan).padStart(2, '0')}-${String(jatuhTempoHari).padStart(2, '0')}`,
      });
    }
  }

  const inserted = store.insertBatch(values);

  return {
    created: inserted.length,
    skipped: values.length - inserted.length,
    total_nominal: inserted.reduce((sum, t) => sum + t.nominal, 0),
  };
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/** Generates a list of students with class info (unique student IDs) */
function arbitraryStudentsWithClass(options?: {
  minCount?: number;
  maxCount?: number;
}): fc.Arbitrary<StudentWithClass[]> {
  const min = options?.minCount ?? 1;
  const max = options?.maxCount ?? 20;

  return fc
    .array(
      fc.record({
        id: arbitraryUuid(),
        kelas_id: arbitraryUuid(),
        tingkat: fc.integer({ min: 1, max: 12 }),
      }),
      { minLength: min, maxLength: max },
    )
    .map((students) => {
      // Ensure unique student IDs
      const seen = new Set<string>();
      return students.filter((s) => {
        if (seen.has(s.id)) return false;
        seen.add(s.id);
        return true;
      });
    })
    .filter((students) => students.length >= min);
}

/** Generates a list of months (1-12 months for a school year) */
function arbitraryMonths(options?: {
  minCount?: number;
  maxCount?: number;
}): fc.Arbitrary<{ bulan: number; tahun: number }[]> {
  const min = options?.minCount ?? 1;
  const max = options?.maxCount ?? 12;

  return fc
    .record({
      startBulan: fc.integer({ min: 1, max: 12 }),
      startTahun: fc.integer({ min: 2023, max: 2027 }),
      count: fc.integer({ min, max }),
    })
    .map(({ startBulan, startTahun, count }) => {
      const months: { bulan: number; tahun: number }[] = [];
      let bulan = startBulan;
      let tahun = startTahun;
      for (let i = 0; i < count; i++) {
        months.push({ bulan, tahun });
        bulan++;
        if (bulan > 12) {
          bulan = 1;
          tahun++;
        }
      }
      return months;
    });
}

/** Generates a nominal config map (tingkat → nominal in Rupiah) */
function arbitraryNominalConfig(): fc.Arbitrary<Record<number, number>> {
  return fc
    .array(
      fc.record({
        tingkat: fc.integer({ min: 1, max: 12 }),
        nominal: arbitraryRupiahAmount(),
      }),
      { minLength: 1, maxLength: 12 },
    )
    .map((entries) => {
      const config: Record<number, number> = {};
      for (const entry of entries) {
        config[entry.tingkat] = entry.nominal;
      }
      return config;
    });
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 8: Billing Generation Idempotency and Correctness', () => {
  it('running generation twice produces same total count — second run inserts 0', () => {
    fc.assert(
      fc.property(
        arbitraryUuid(), // tenantId
        arbitraryStudentsWithClass({ minCount: 1, maxCount: 15 }),
        arbitraryMonths({ minCount: 1, maxCount: 6 }),
        arbitraryNominalConfig(),
        fc.integer({ min: 1, max: 28 }), // jatuhTempoHari
        (tenantId, students, months, nominalConfig, jatuhTempoHari) => {
          const store = new BillingStore();

          // First run
          const result1 = generateBilling(
            store,
            tenantId,
            students,
            months,
            nominalConfig,
            jatuhTempoHari,
          );

          const countAfterFirst = store.count;

          // Second run — same parameters
          const result2 = generateBilling(
            store,
            tenantId,
            students,
            months,
            nominalConfig,
            jatuhTempoHari,
          );

          // PROPERTY: second run creates 0 (all skipped as duplicates)
          return (
            result2.created === 0 &&
            result2.skipped === students.length * months.length &&
            store.count === countAfterFirst
          );
        },
      ),
      PBT_CONFIG,
    );
  });

  it('for N students × M months, exactly N×M records are generated on first run', () => {
    fc.assert(
      fc.property(
        arbitraryUuid(),
        arbitraryStudentsWithClass({ minCount: 1, maxCount: 15 }),
        arbitraryMonths({ minCount: 1, maxCount: 12 }),
        arbitraryNominalConfig(),
        fc.integer({ min: 1, max: 28 }),
        (tenantId, students, months, nominalConfig, jatuhTempoHari) => {
          const store = new BillingStore();

          const result = generateBilling(
            store,
            tenantId,
            students,
            months,
            nominalConfig,
            jatuhTempoHari,
          );

          const expectedCount = students.length * months.length;

          // PROPERTY: created equals N×M and total count equals N×M
          return result.created === expectedCount && store.count === expectedCount;
        },
      ),
      PBT_CONFIG,
    );
  });

  it('no duplicates for same (siswa_id, bulan, tahun) even with repeated inserts', () => {
    fc.assert(
      fc.property(
        arbitraryUuid(),
        arbitraryStudentsWithClass({ minCount: 1, maxCount: 10 }),
        arbitraryMonths({ minCount: 1, maxCount: 6 }),
        arbitraryNominalConfig(),
        fc.integer({ min: 1, max: 28 }),
        fc.integer({ min: 2, max: 5 }), // number of repeated generations
        (tenantId, students, months, nominalConfig, jatuhTempoHari, repetitions) => {
          const store = new BillingStore();

          // Run generation multiple times
          for (let i = 0; i < repetitions; i++) {
            generateBilling(store, tenantId, students, months, nominalConfig, jatuhTempoHari);
          }

          // PROPERTY: no duplicates — each (siswa_id, bulan, tahun) appears exactly once
          const seen = new Set<string>();
          for (const record of store.getAll()) {
            const key = `${record.siswa_id}|${record.bulan}|${record.tahun}`;
            if (seen.has(key)) return false;
            seen.add(key);
          }

          // PROPERTY: total count equals N×M (unique combinations)
          return store.count === students.length * months.length;
        },
      ),
      PBT_CONFIG,
    );
  });

  it('each generated tagihan has correct nominal based on student tingkat', () => {
    fc.assert(
      fc.property(
        arbitraryUuid(),
        arbitraryStudentsWithClass({ minCount: 1, maxCount: 15 }),
        arbitraryMonths({ minCount: 1, maxCount: 6 }),
        arbitraryNominalConfig(),
        fc.integer({ min: 1, max: 28 }),
        (tenantId, students, months, nominalConfig, jatuhTempoHari) => {
          const store = new BillingStore();

          generateBilling(store, tenantId, students, months, nominalConfig, jatuhTempoHari);

          // PROPERTY: each tagihan's nominal matches the config for that student's tingkat
          for (const record of store.getAll()) {
            const student = students.find((s) => s.id === record.siswa_id);
            if (!student) return false;

            const expectedNominal = nominalConfig[student.tingkat] ?? 500000;
            if (record.nominal !== expectedNominal) return false;
          }

          return true;
        },
      ),
      PBT_CONFIG,
    );
  });

  it('partial pre-existence: some already exist, remaining are still created correctly', () => {
    fc.assert(
      fc.property(
        arbitraryUuid(),
        arbitraryStudentsWithClass({ minCount: 2, maxCount: 10 }),
        arbitraryMonths({ minCount: 2, maxCount: 6 }),
        arbitraryNominalConfig(),
        fc.integer({ min: 1, max: 28 }),
        (tenantId, students, months, nominalConfig, jatuhTempoHari) => {
          const store = new BillingStore();

          // Pre-populate: generate billing for only the first half of students
          const firstHalf = students.slice(0, Math.ceil(students.length / 2));
          generateBilling(store, tenantId, firstHalf, months, nominalConfig, jatuhTempoHari);

          const preExistingCount = store.count;
          const expectedPreExisting = firstHalf.length * months.length;

          if (preExistingCount !== expectedPreExisting) return false;

          // Now generate for ALL students (includes the already-existing ones)
          const result = generateBilling(
            store,
            tenantId,
            students,
            months,
            nominalConfig,
            jatuhTempoHari,
          );

          // PROPERTY: only the second half students get new records created
          const secondHalf = students.slice(Math.ceil(students.length / 2));
          const expectedNew = secondHalf.length * months.length;
          const expectedSkipped = firstHalf.length * months.length;

          const createdCorrect = result.created === expectedNew;
          const skippedCorrect = result.skipped === expectedSkipped;
          const totalCorrect = store.count === students.length * months.length;

          return createdCorrect && skippedCorrect && totalCorrect;
        },
      ),
      PBT_CONFIG,
    );
  });
});
