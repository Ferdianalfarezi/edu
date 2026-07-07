/**
 * Property 7: Alpa Threshold Alerting
 *
 * For any student whose accumulated alpa count EXCEEDS the configured threshold,
 * that student MUST appear in the "perhatian khusus" alert list.
 * For any student whose accumulated alpa count is AT or BELOW the threshold,
 * that student MUST NOT appear in the alert list.
 * The threshold is configurable per tenant — different thresholds produce
 * different alert lists from the same data.
 *
 * **Validates: Requirements 5.3**
 *
 * This is a PURE logic property test — simulates the threshold check with
 * arbitrary student attendance records and threshold values. No DB or network dependencies.
 */

import fc from 'fast-check';
import { PBT_CONFIG } from '../config';
import { arbitraryUuid } from '../arbitraries/common';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StudentAlpaRecord {
  siswa_id: string;
  siswa_nama: string;
  kelas_nama: string;
  total_alpa: number;
}

interface PerhatianKhususEntry {
  siswa_id: string;
  siswa_nama: string;
  kelas_nama: string;
  total_alpa: number;
}

// ─── Pure logic (mirrors the service implementation) ──────────────────────────

/**
 * Determines which students should be in the "perhatian khusus" alert list.
 * A student appears if their accumulated alpa count EXCEEDS (strictly >) the threshold.
 *
 * This mirrors the service logic:
 *   `.having(sql`count(${absensi.id}) > ${thresholdAlpa}`)`
 */
function computePerhatianKhusus(
  studentAlpaCounts: StudentAlpaRecord[],
  threshold: number,
): PerhatianKhususEntry[] {
  return studentAlpaCounts
    .filter((s) => s.total_alpa > threshold)
    .map((s) => ({
      siswa_id: s.siswa_id,
      siswa_nama: s.siswa_nama,
      kelas_nama: s.kelas_nama,
      total_alpa: s.total_alpa,
    }));
}

/**
 * Extracts the threshold value from config, mirroring the service logic:
 *   `Number(thresholdConfig.value?.value ?? thresholdConfig.value ?? 10)`
 */
function extractThreshold(configValue: unknown): number {
  if (configValue && typeof configValue === 'object' && 'value' in configValue) {
    return Number((configValue as { value: unknown }).value);
  }
  if (typeof configValue === 'number') {
    return configValue;
  }
  return 10; // default
}

// ─── Arbitrary Generators ─────────────────────────────────────────────────────

/**
 * Generates a valid alpa threshold (positive integer).
 * Realistic range: 1-50 (schools typically set 3-20).
 */
function arbitraryThreshold(): fc.Arbitrary<number> {
  return fc.integer({ min: 1, max: 50 });
}

/**
 * Generates a student with a specific alpa count.
 */
function arbitraryStudentAlpa(options?: {
  minAlpa?: number;
  maxAlpa?: number;
}): fc.Arbitrary<StudentAlpaRecord> {
  return fc.record({
    siswa_id: arbitraryUuid(),
    siswa_nama: fc.constantFrom(
      'Ahmad Rafi',
      'Budi Santoso',
      'Citra Dewi',
      'Dewi Sari',
      'Eka Putri',
      'Farhan Hadi',
      'Gita Wahyu',
      'Hadi Joko',
    ),
    kelas_nama: fc.constantFrom('1A', '1B', '2A', '2B', '3A', '3B', '4A', '5A', '6A'),
    total_alpa: fc.integer({ min: options?.minAlpa ?? 0, max: options?.maxAlpa ?? 100 }),
  });
}

/**
 * Generates an array of students with varying alpa counts.
 */
function arbitraryStudentList(): fc.Arbitrary<StudentAlpaRecord[]> {
  return fc.array(arbitraryStudentAlpa(), { minLength: 0, maxLength: 30 });
}

/**
 * Generates a config value in the format used by konfigurasi_sekolah.
 * Can be either { value: N } (object format) or just N (plain number).
 */
function arbitraryConfigValue(): fc.Arbitrary<{ value: number } | number> {
  return fc.oneof(
    arbitraryThreshold().map((n) => ({ value: n })),
    arbitraryThreshold(),
  );
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 7: Alpa Threshold Alerting', () => {
  describe('Students exceeding threshold MUST appear in alert list', () => {
    it('any student with alpa count > threshold appears in perhatian khusus', () => {
      fc.assert(
        fc.property(
          arbitraryThreshold(),
          fc.array(arbitraryStudentAlpa({ minAlpa: 0, maxAlpa: 100 }), {
            minLength: 1,
            maxLength: 30,
          }),
          (threshold, students) => {
            const alertList = computePerhatianKhusus(students, threshold);
            const alertIds = new Set(alertList.map((a) => a.siswa_id));

            // For every student whose alpa EXCEEDS threshold, they MUST be in the alert list
            for (const student of students) {
              if (student.total_alpa > threshold) {
                if (!alertIds.has(student.siswa_id)) {
                  return false;
                }
              }
            }
            return true;
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('Students at or below threshold MUST NOT appear in alert list', () => {
    it('any student with alpa count <= threshold does NOT appear in perhatian khusus', () => {
      fc.assert(
        fc.property(
          arbitraryThreshold(),
          fc.array(arbitraryStudentAlpa({ minAlpa: 0, maxAlpa: 100 }), {
            minLength: 1,
            maxLength: 30,
          }),
          (threshold, students) => {
            const alertList = computePerhatianKhusus(students, threshold);
            const alertIds = new Set(alertList.map((a) => a.siswa_id));

            // For every student whose alpa is AT or BELOW threshold, they MUST NOT be in the alert list
            for (const student of students) {
              if (student.total_alpa <= threshold) {
                if (alertIds.has(student.siswa_id)) {
                  return false;
                }
              }
            }
            return true;
          },
        ),
        PBT_CONFIG,
      );
    });

    it('student with alpa count exactly equal to threshold is NOT in alert list', () => {
      fc.assert(
        fc.property(
          arbitraryThreshold(),
          arbitraryUuid(),
          fc.constantFrom('1A', '2A', '3A', '4A', '5A', '6A'),
          (threshold, siswaId, kelasNama) => {
            // Create a student with alpa count exactly at threshold
            const students: StudentAlpaRecord[] = [
              {
                siswa_id: siswaId,
                siswa_nama: 'Test Student',
                kelas_nama: kelasNama,
                total_alpa: threshold, // exactly at threshold
              },
            ];

            const alertList = computePerhatianKhusus(students, threshold);

            // PROPERTY: at threshold (not exceeding) → NOT in alert list
            return alertList.length === 0;
          },
        ),
        PBT_CONFIG,
      );
    });

    it('student with alpa count one above threshold IS in alert list', () => {
      fc.assert(
        fc.property(
          arbitraryThreshold(),
          arbitraryUuid(),
          fc.constantFrom('1A', '2A', '3A', '4A', '5A', '6A'),
          (threshold, siswaId, kelasNama) => {
            // Create a student with alpa count just above threshold
            const students: StudentAlpaRecord[] = [
              {
                siswa_id: siswaId,
                siswa_nama: 'Test Student',
                kelas_nama: kelasNama,
                total_alpa: threshold + 1, // one above threshold
              },
            ];

            const alertList = computePerhatianKhusus(students, threshold);

            // PROPERTY: one above threshold → IS in alert list
            return alertList.length === 1 && alertList[0].siswa_id === siswaId;
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('Threshold is configurable per tenant', () => {
    it('different thresholds produce different alert lists from same student data', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 20 }), // lowerThreshold
          fc.integer({ min: 1, max: 30 }), // offset (to ensure different thresholds)
          fc.array(arbitraryStudentAlpa({ minAlpa: 0, maxAlpa: 50 }), {
            minLength: 5,
            maxLength: 30,
          }),
          (lowerThreshold, offset, students) => {
            const higherThreshold = lowerThreshold + offset;
            fc.pre(higherThreshold > lowerThreshold);

            const alertListLow = computePerhatianKhusus(students, lowerThreshold);
            const alertListHigh = computePerhatianKhusus(students, higherThreshold);

            // PROPERTY: a higher threshold should produce an alert list that is a
            // subset of (or equal to) the alert list from a lower threshold.
            // More permissive threshold → fewer alerts.
            const highAlertIds = new Set(alertListHigh.map((a) => a.siswa_id));
            const lowAlertIds = new Set(alertListLow.map((a) => a.siswa_id));

            // Every student in the high-threshold alert list MUST also be in the low-threshold list
            for (const id of highAlertIds) {
              if (!lowAlertIds.has(id)) {
                return false;
              }
            }

            // The lower threshold should have >= alerts than the higher threshold
            return alertListLow.length >= alertListHigh.length;
          },
        ),
        PBT_CONFIG,
      );
    });

    it('config value extraction works for both object and plain number formats', () => {
      fc.assert(
        fc.property(arbitraryConfigValue(), (configValue) => {
          const extracted = extractThreshold(configValue);
          const expected =
            typeof configValue === 'number'
              ? configValue
              : (configValue as { value: number }).value;

          // PROPERTY: extracted threshold matches the underlying value regardless of format
          return extracted === expected;
        }),
        PBT_CONFIG,
      );
    });

    it('two tenants with same students but different thresholds get different results', () => {
      fc.assert(
        fc.property(
          arbitraryUuid(), // tenantA
          arbitraryUuid(), // tenantB
          fc.integer({ min: 3, max: 8 }), // thresholdA (lower)
          fc.integer({ min: 15, max: 30 }), // thresholdB (higher)
          (tenantA, tenantB, thresholdA, thresholdB) => {
            fc.pre(tenantA !== tenantB);
            fc.pre(thresholdA < thresholdB);

            // Same students in both tenants, with alpa counts between thresholds
            const sharedStudents: StudentAlpaRecord[] = [
              {
                siswa_id: 'student-1',
                siswa_nama: 'Ahmad',
                kelas_nama: '1A',
                total_alpa: thresholdA + 2, // exceeds A but might be below B
              },
              {
                siswa_id: 'student-2',
                siswa_nama: 'Budi',
                kelas_nama: '2A',
                total_alpa: thresholdB + 1, // exceeds both
              },
            ];

            // Ensure student-1 is between the two thresholds for meaningful test
            fc.pre(sharedStudents[0].total_alpa <= thresholdB);

            const alertsA = computePerhatianKhusus(sharedStudents, thresholdA);
            const alertsB = computePerhatianKhusus(sharedStudents, thresholdB);

            // PROPERTY: Tenant A (lower threshold) should have MORE alerts than Tenant B
            // student-1 only appears in A's list, student-2 appears in both
            return alertsA.length > alertsB.length;
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('Edge cases', () => {
    it('empty student list produces empty alert list regardless of threshold', () => {
      fc.assert(
        fc.property(arbitraryThreshold(), (threshold) => {
          const alertList = computePerhatianKhusus([], threshold);
          return alertList.length === 0;
        }),
        PBT_CONFIG,
      );
    });

    it('zero alpa count never triggers alert for any positive threshold', () => {
      fc.assert(
        fc.property(
          arbitraryThreshold(),
          arbitraryUuid(),
          fc.constantFrom('1A', '2B', '3A'),
          (threshold, siswaId, kelasNama) => {
            const students: StudentAlpaRecord[] = [
              {
                siswa_id: siswaId,
                siswa_nama: 'Student Zero',
                kelas_nama: kelasNama,
                total_alpa: 0,
              },
            ];

            const alertList = computePerhatianKhusus(students, threshold);
            return alertList.length === 0;
          },
        ),
        PBT_CONFIG,
      );
    });

    it('alert list preserves accurate total_alpa count for each student', () => {
      fc.assert(
        fc.property(
          arbitraryThreshold(),
          fc.array(arbitraryStudentAlpa({ minAlpa: 0, maxAlpa: 100 }), {
            minLength: 1,
            maxLength: 20,
          }),
          (threshold, students) => {
            const alertList = computePerhatianKhusus(students, threshold);

            // For each student in the alert list, verify their total_alpa is preserved correctly
            for (const alert of alertList) {
              const original = students.find((s) => s.siswa_id === alert.siswa_id);
              if (!original || original.total_alpa !== alert.total_alpa) {
                return false;
              }
            }
            return true;
          },
        ),
        PBT_CONFIG,
      );
    });
  });
});
