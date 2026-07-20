/**
 * Pure function that implements the source selection algorithm for kelas duplication.
 *
 * Given an array of tahun ajaran candidates, selects the most recent one
 * (by tanggalMulai DESC, then createdAt DESC) that has at least one kelas record,
 * excluding the newly created tahun ajaran.
 *
 * This mirrors the logic in TahunAjaranService.findSourceTahunAjaran() but
 * as a pure, testable function independent of the database.
 */

export interface TahunAjaranCandidate {
  id: string;
  tanggalMulai: string;
  createdAt: Date;
  kelasCount: number;
  status: string;
}

/**
 * Selects the source tahun ajaran for kelas duplication.
 *
 * @param candidates - All tahun ajaran in the same tenant
 * @param excludeId - The ID of the newly created tahun ajaran (to exclude)
 * @returns The selected source candidate, or null if none qualifies
 */
export function selectSource(
  candidates: TahunAjaranCandidate[],
  excludeId: string,
): TahunAjaranCandidate | null {
  const eligible = candidates
    .filter((c) => c.id !== excludeId && c.kelasCount > 0)
    .sort((a, b) => {
      // Sort by tanggalMulai DESC (string comparison works for ISO dates)
      if (a.tanggalMulai !== b.tanggalMulai) {
        return b.tanggalMulai.localeCompare(a.tanggalMulai);
      }
      // Tiebreaker: createdAt DESC
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

  return eligible[0] ?? null;
}
