/**
 * Property 6: Attendance Aggregation Correctness
 *
 * Verifies that attendance aggregation (rekap) logic correctly counts
 * attendance records per student per period. The aggregation must be
 * complete (no records lost), deterministic (same input → same output),
 * and each record must contribute to exactly one status counter.
 *
 * **Validates: Requirements 4.1, 4.2, 5.1, 5.2, 8.2**
 *
 * This is a PURE logic property test — exercises the aggregation algorithm
 * with arbitrary attendance records. No DB or network dependencies.
 */

import fc from 'fast-check';
import { PBT_CONFIG } from '../config';
import { arbitraryUuid, arbitraryAttendanceStatus, type AttendanceStatus } from '../arbitraries';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AttendanceRecord {
  siswa_id: string;
  kelas_id: string;
  tanggal: string; // ISO date (YYYY-MM-DD)
  status: AttendanceStatus;
}

interface AggregatedCounts {
  hadir: number;
  izin: number;
  sakit: number;
  alpa: number;
}

interface RekapItem {
  siswa_id: string;
  hadir: number;
  izin: number;
  sakit: number;
  alpa: number;
}

// ─── Pure aggregation logic (mirrors AbsensiService.getRekapAbsensi) ──────────

/**
 * Aggregates attendance records per student within a given date range.
 * This mirrors the service logic:
 *   - Filter records by date range
 *   - Group by siswa_id
 *   - Count each status type
 */
function aggregateAttendance(
  records: AttendanceRecord[],
  startDate: string,
  endDate: string,
): Map<string, AggregatedCounts> {
  const countsMap = new Map<string, AggregatedCounts>();

  for (const record of records) {
    // Filter by date range (inclusive)
    if (record.tanggal < startDate || record.tanggal > endDate) {
      continue;
    }

    if (!countsMap.has(record.siswa_id)) {
      countsMap.set(record.siswa_id, { hadir: 0, izin: 0, sakit: 0, alpa: 0 });
    }
    const counts = countsMap.get(record.siswa_id)!;
    counts[record.status]++;
  }

  return countsMap;
}

/**
 * Computes date range for a given month (mirrors getDateRange in service).
 */
function getMonthDateRange(bulan: number, tahun: number): { startDate: string; endDate: string } {
  const startDate = `${tahun}-${String(bulan).padStart(2, '0')}-01`;
  const lastDay = new Date(tahun, bulan, 0).getDate();
  const endDate = `${tahun}-${String(bulan).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { startDate, endDate };
}

// ─── Arbitrary Generators ─────────────────────────────────────────────────────

/**
 * Generates a date string within a specific month.
 */
function arbitraryDateInMonth(bulan: number, tahun: number): fc.Arbitrary<string> {
  const lastDay = new Date(tahun, bulan, 0).getDate();
  return fc
    .integer({ min: 1, max: lastDay })
    .map((day) => `${tahun}-${String(bulan).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
}

/**
 * Generates a valid month (1-12).
 */
function arbitraryMonth(): fc.Arbitrary<number> {
  return fc.integer({ min: 1, max: 12 });
}

/**
 * Generates a valid year for school context.
 */
function arbitraryYear(): fc.Arbitrary<number> {
  return fc.integer({ min: 2020, max: 2030 });
}

/**
 * Generates a set of unique student IDs.
 */
function arbitraryStudentIds(options?: { min?: number; max?: number }): fc.Arbitrary<string[]> {
  return fc
    .array(arbitraryUuid(), {
      minLength: options?.min ?? 1,
      maxLength: options?.max ?? 10,
    })
    .map((ids) => [...new Set(ids)]); // Ensure uniqueness
}

/**
 * Generates attendance records for a set of students within a specific month.
 * Each student may have 0 to daysInMonth records (one per day max, matching the
 * system constraint of one record per student per day).
 */
function arbitraryAttendanceRecordsForMonth(
  siswaIds: string[],
  kelasId: string,
  bulan: number,
  tahun: number,
): fc.Arbitrary<AttendanceRecord[]> {
  const lastDay = new Date(tahun, bulan, 0).getDate();

  // For each student, pick a random subset of days in the month and assign statuses
  const perStudentRecords = siswaIds.map((siswaId) =>
    fc
      .subarray(
        Array.from({ length: lastDay }, (_, i) => i + 1),
        { minLength: 0, maxLength: lastDay },
      )
      .chain((days) =>
        days.length === 0
          ? fc.constant([])
          : fc.tuple(...days.map(() => arbitraryAttendanceStatus())).map((statuses) =>
              days.map((day, idx) => ({
                siswa_id: siswaId,
                kelas_id: kelasId,
                tanggal: `${tahun}-${String(bulan).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
                status: statuses[idx],
              })),
            ),
      ),
  );

  if (perStudentRecords.length === 0) {
    return fc.constant([]);
  }

  return fc.tuple(...perStudentRecords).map((arrays) => arrays.flat()) as fc.Arbitrary<
    AttendanceRecord[]
  >;
}

/**
 * Generates attendance records spread across multiple months.
 * Useful for testing that monthly aggregation only counts records in the target month.
 */
function arbitraryRecordsAcrossMonths(
  siswaId: string,
  kelasId: string,
  targetMonth: number,
  targetYear: number,
): fc.Arbitrary<{ inMonth: AttendanceRecord[]; outOfMonth: AttendanceRecord[] }> {
  const lastDay = new Date(targetYear, targetMonth, 0).getDate();

  // Records inside the target month
  const inMonthArb = fc
    .array(fc.tuple(fc.integer({ min: 1, max: lastDay }), arbitraryAttendanceStatus()), {
      minLength: 1,
      maxLength: Math.min(lastDay, 20),
    })
    .map((pairs) => {
      // Deduplicate days to respect one-record-per-day constraint
      const seenDays = new Set<number>();
      return pairs
        .filter(([day]) => {
          if (seenDays.has(day)) return false;
          seenDays.add(day);
          return true;
        })
        .map(([day, status]) => ({
          siswa_id: siswaId,
          kelas_id: kelasId,
          tanggal: `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          status,
        }));
    });

  // Records outside the target month (different months)
  const otherMonth = targetMonth === 1 ? 12 : targetMonth - 1;
  const otherYear = targetMonth === 1 ? targetYear - 1 : targetYear;
  const otherLastDay = new Date(otherYear, otherMonth, 0).getDate();

  const outOfMonthArb = fc
    .array(fc.tuple(fc.integer({ min: 1, max: otherLastDay }), arbitraryAttendanceStatus()), {
      minLength: 0,
      maxLength: 10,
    })
    .map((pairs) => {
      const seenDays = new Set<number>();
      return pairs
        .filter(([day]) => {
          if (seenDays.has(day)) return false;
          seenDays.add(day);
          return true;
        })
        .map(([day, status]) => ({
          siswa_id: siswaId,
          kelas_id: kelasId,
          tanggal: `${otherYear}-${String(otherMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          status,
        }));
    });

  return fc.tuple(inMonthArb, outOfMonthArb).map(([inMonth, outOfMonth]) => ({
    inMonth,
    outOfMonth,
  }));
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 6: Attendance Aggregation Correctness', () => {
  describe('Sum of status counts equals total records for each student', () => {
    it('hadir + izin + sakit + alpa equals total attendance records per student in period', () => {
      fc.assert(
        fc.property(
          arbitraryMonth(),
          arbitraryYear(),
          arbitraryUuid(), // kelasId
          arbitraryStudentIds({ min: 1, max: 8 }),
          (bulan, tahun, kelasId, siswaIds) => {
            // Ensure we have at least one unique student
            fc.pre(siswaIds.length >= 1);

            return fc.assert(
              fc.property(
                arbitraryAttendanceRecordsForMonth(siswaIds, kelasId, bulan, tahun),
                (records) => {
                  const { startDate, endDate } = getMonthDateRange(bulan, tahun);
                  const aggregated = aggregateAttendance(records, startDate, endDate);

                  // For each student, sum of all status counts must equal their total records in period
                  for (const siswaId of siswaIds) {
                    const counts = aggregated.get(siswaId) ?? {
                      hadir: 0,
                      izin: 0,
                      sakit: 0,
                      alpa: 0,
                    };
                    const sumCounts = counts.hadir + counts.izin + counts.sakit + counts.alpa;
                    const actualRecords = records.filter(
                      (r) =>
                        r.siswa_id === siswaId && r.tanggal >= startDate && r.tanggal <= endDate,
                    ).length;

                    if (sumCounts !== actualRecords) {
                      return false;
                    }
                  }
                  return true;
                },
              ),
              { numRuns: 1 },
            );
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('Aggregation is deterministic', () => {
    it('same input records always produce same aggregated counts', () => {
      fc.assert(
        fc.property(
          arbitraryMonth(),
          arbitraryYear(),
          arbitraryUuid(), // kelasId
          arbitraryStudentIds({ min: 1, max: 5 }),
          (bulan, tahun, kelasId, siswaIds) => {
            fc.pre(siswaIds.length >= 1);

            return fc.assert(
              fc.property(
                arbitraryAttendanceRecordsForMonth(siswaIds, kelasId, bulan, tahun),
                (records) => {
                  const { startDate, endDate } = getMonthDateRange(bulan, tahun);

                  // Run aggregation twice on same input
                  const result1 = aggregateAttendance(records, startDate, endDate);
                  const result2 = aggregateAttendance(records, startDate, endDate);

                  // Must produce identical results
                  if (result1.size !== result2.size) return false;

                  for (const [siswaId, counts1] of result1) {
                    const counts2 = result2.get(siswaId);
                    if (!counts2) return false;
                    if (
                      counts1.hadir !== counts2.hadir ||
                      counts1.izin !== counts2.izin ||
                      counts1.sakit !== counts2.sakit ||
                      counts1.alpa !== counts2.alpa
                    ) {
                      return false;
                    }
                  }
                  return true;
                },
              ),
              { numRuns: 1 },
            );
          },
        ),
        PBT_CONFIG,
      );
    });

    it('shuffled input records produce same aggregated counts', () => {
      fc.assert(
        fc.property(
          arbitraryMonth(),
          arbitraryYear(),
          arbitraryUuid(),
          arbitraryStudentIds({ min: 1, max: 5 }),
          (bulan, tahun, kelasId, siswaIds) => {
            fc.pre(siswaIds.length >= 1);

            return fc.assert(
              fc.property(
                arbitraryAttendanceRecordsForMonth(siswaIds, kelasId, bulan, tahun),
                fc.infiniteStream(fc.nat()),
                (records, seeds) => {
                  if (records.length === 0) return true;

                  const { startDate, endDate } = getMonthDateRange(bulan, tahun);

                  // Original aggregation
                  const original = aggregateAttendance(records, startDate, endDate);

                  // Shuffle the records (Fisher-Yates using seeds from fast-check)
                  const shuffled = [...records];
                  const seedIter = seeds[Symbol.iterator]();
                  for (let i = shuffled.length - 1; i > 0; i--) {
                    const j = (seedIter.next().value ?? 0) % (i + 1);
                    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                  }

                  // Shuffled aggregation
                  const afterShuffle = aggregateAttendance(shuffled, startDate, endDate);

                  // Must be identical
                  if (original.size !== afterShuffle.size) return false;
                  for (const [siswaId, counts1] of original) {
                    const counts2 = afterShuffle.get(siswaId);
                    if (!counts2) return false;
                    if (
                      counts1.hadir !== counts2.hadir ||
                      counts1.izin !== counts2.izin ||
                      counts1.sakit !== counts2.sakit ||
                      counts1.alpa !== counts2.alpa
                    ) {
                      return false;
                    }
                  }
                  return true;
                },
              ),
              { numRuns: 1 },
            );
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('Monthly aggregation counts exactly records within that calendar month', () => {
    it('only records within the target month date range are counted', () => {
      fc.assert(
        fc.property(
          arbitraryMonth(),
          arbitraryYear(),
          arbitraryUuid(), // siswaId
          arbitraryUuid(), // kelasId
          (bulan, tahun, siswaId, kelasId) => {
            return fc.assert(
              fc.property(
                arbitraryRecordsAcrossMonths(siswaId, kelasId, bulan, tahun),
                ({ inMonth, outOfMonth }) => {
                  const allRecords = [...inMonth, ...outOfMonth];
                  const { startDate, endDate } = getMonthDateRange(bulan, tahun);

                  const aggregated = aggregateAttendance(allRecords, startDate, endDate);
                  const counts = aggregated.get(siswaId) ?? {
                    hadir: 0,
                    izin: 0,
                    sakit: 0,
                    alpa: 0,
                  };

                  const totalCounted = counts.hadir + counts.izin + counts.sakit + counts.alpa;

                  // PROPERTY: Only in-month records are counted
                  // Total counted must equal exactly the number of in-month records
                  return totalCounted === inMonth.length;
                },
              ),
              { numRuns: 1 },
            );
          },
        ),
        PBT_CONFIG,
      );
    });

    it('records from adjacent months are never included in aggregation', () => {
      fc.assert(
        fc.property(
          arbitraryMonth(),
          arbitraryYear(),
          arbitraryUuid(), // siswaId
          arbitraryUuid(), // kelasId
          fc.array(arbitraryAttendanceStatus(), { minLength: 1, maxLength: 15 }),
          (bulan, tahun, siswaId, kelasId, statuses) => {
            // Create records ONLY in adjacent months (not in target month)
            const prevMonth = bulan === 1 ? 12 : bulan - 1;
            const prevYear = bulan === 1 ? tahun - 1 : tahun;
            const nextMonth = bulan === 12 ? 1 : bulan + 1;
            const nextYear = bulan === 12 ? tahun + 1 : tahun;

            const prevLastDay = new Date(prevYear, prevMonth, 0).getDate();
            const nextLastDay = new Date(nextYear, nextMonth, 0).getDate();

            const outOfMonthRecords: AttendanceRecord[] = statuses.map((status, idx) => {
              // Alternate between previous and next month
              if (idx % 2 === 0) {
                const day = (idx % prevLastDay) + 1;
                return {
                  siswa_id: siswaId,
                  kelas_id: kelasId,
                  tanggal: `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
                  status,
                };
              } else {
                const day = (idx % nextLastDay) + 1;
                return {
                  siswa_id: siswaId,
                  kelas_id: kelasId,
                  tanggal: `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
                  status,
                };
              }
            });

            const { startDate, endDate } = getMonthDateRange(bulan, tahun);
            const aggregated = aggregateAttendance(outOfMonthRecords, startDate, endDate);

            // PROPERTY: No records from other months should be counted
            return !aggregated.has(siswaId);
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('Each record contributes to exactly one status counter', () => {
    it('a single record increments exactly one of the four status counters', () => {
      fc.assert(
        fc.property(
          arbitraryUuid(), // siswaId
          arbitraryUuid(), // kelasId
          arbitraryAttendanceStatus(),
          arbitraryDateInMonth(6, 2024), // Use a fixed month for simplicity
          (siswaId, kelasId, status, tanggal) => {
            const record: AttendanceRecord = {
              siswa_id: siswaId,
              kelas_id: kelasId,
              tanggal,
              status,
            };
            const { startDate, endDate } = getMonthDateRange(6, 2024);

            const aggregated = aggregateAttendance([record], startDate, endDate);
            const counts = aggregated.get(siswaId)!;

            // PROPERTY: Exactly one counter equals 1, all others equal 0
            const countsArray = [counts.hadir, counts.izin, counts.sakit, counts.alpa];
            const onesCount = countsArray.filter((c) => c === 1).length;
            const zerosCount = countsArray.filter((c) => c === 0).length;

            return onesCount === 1 && zerosCount === 3;
          },
        ),
        PBT_CONFIG,
      );
    });

    it('the incremented counter matches the record status', () => {
      fc.assert(
        fc.property(
          arbitraryUuid(),
          arbitraryUuid(),
          arbitraryAttendanceStatus(),
          arbitraryDateInMonth(6, 2024),
          (siswaId, kelasId, status, tanggal) => {
            const record: AttendanceRecord = {
              siswa_id: siswaId,
              kelas_id: kelasId,
              tanggal,
              status,
            };
            const { startDate, endDate } = getMonthDateRange(6, 2024);

            const aggregated = aggregateAttendance([record], startDate, endDate);
            const counts = aggregated.get(siswaId)!;

            // PROPERTY: The counter that corresponds to the status is exactly 1
            return counts[status] === 1;
          },
        ),
        PBT_CONFIG,
      );
    });

    it('multiple records for same student each contribute to their respective counter', () => {
      fc.assert(
        fc.property(
          arbitraryUuid(), // siswaId
          arbitraryUuid(), // kelasId
          fc.array(arbitraryAttendanceStatus(), { minLength: 2, maxLength: 20 }),
          (siswaId, kelasId, statuses) => {
            // Create records with unique days
            const records: AttendanceRecord[] = statuses
              .slice(0, Math.min(statuses.length, 28)) // Max 28 days in any month
              .map((status, idx) => ({
                siswa_id: siswaId,
                kelas_id: kelasId,
                tanggal: `2024-06-${String(idx + 1).padStart(2, '0')}`,
                status,
              }));

            const { startDate, endDate } = getMonthDateRange(6, 2024);
            const aggregated = aggregateAttendance(records, startDate, endDate);
            const counts = aggregated.get(siswaId)!;

            // PROPERTY: Each status counter equals the number of records with that status
            const expectedHadir = records.filter((r) => r.status === 'hadir').length;
            const expectedIzin = records.filter((r) => r.status === 'izin').length;
            const expectedSakit = records.filter((r) => r.status === 'sakit').length;
            const expectedAlpa = records.filter((r) => r.status === 'alpa').length;

            return (
              counts.hadir === expectedHadir &&
              counts.izin === expectedIzin &&
              counts.sakit === expectedSakit &&
              counts.alpa === expectedAlpa
            );
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('Empty records yield all-zero counts', () => {
    it('no attendance records produces empty aggregation map', () => {
      fc.assert(
        fc.property(arbitraryMonth(), arbitraryYear(), (bulan, tahun) => {
          const { startDate, endDate } = getMonthDateRange(bulan, tahun);
          const aggregated = aggregateAttendance([], startDate, endDate);

          // PROPERTY: Empty input → empty output
          return aggregated.size === 0;
        }),
        PBT_CONFIG,
      );
    });

    it('student with no records in period gets zero counts when looked up', () => {
      fc.assert(
        fc.property(
          arbitraryUuid(), // siswaId
          arbitraryMonth(),
          arbitraryYear(),
          (siswaId, bulan, tahun) => {
            const { startDate, endDate } = getMonthDateRange(bulan, tahun);
            const aggregated = aggregateAttendance([], startDate, endDate);

            // Simulate what the service does: default to zeros if not in map
            const counts = aggregated.get(siswaId) ?? {
              hadir: 0,
              izin: 0,
              sakit: 0,
              alpa: 0,
            };

            // PROPERTY: All counts are zero
            return (
              counts.hadir === 0 && counts.izin === 0 && counts.sakit === 0 && counts.alpa === 0
            );
          },
        ),
        PBT_CONFIG,
      );
    });

    it('student with records only outside period gets zero counts for that period', () => {
      fc.assert(
        fc.property(
          arbitraryUuid(), // siswaId
          arbitraryUuid(), // kelasId
          fc.array(arbitraryAttendanceStatus(), { minLength: 1, maxLength: 10 }),
          (siswaId, kelasId, statuses) => {
            // Target month: June 2024
            const targetBulan = 6;
            const targetTahun = 2024;

            // All records are in July 2024 (outside target month)
            const records: AttendanceRecord[] = statuses.map((status, idx) => ({
              siswa_id: siswaId,
              kelas_id: kelasId,
              tanggal: `2024-07-${String((idx % 28) + 1).padStart(2, '0')}`,
              status,
            }));

            const { startDate, endDate } = getMonthDateRange(targetBulan, targetTahun);
            const aggregated = aggregateAttendance(records, startDate, endDate);

            // PROPERTY: Student should not appear in the map (or have zero counts)
            const counts = aggregated.get(siswaId) ?? {
              hadir: 0,
              izin: 0,
              sakit: 0,
              alpa: 0,
            };

            return (
              counts.hadir === 0 && counts.izin === 0 && counts.sakit === 0 && counts.alpa === 0
            );
          },
        ),
        PBT_CONFIG,
      );
    });
  });
});
