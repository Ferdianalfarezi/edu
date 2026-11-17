/**
 * Tingkat disimpan relatif per jenjang (SD 1–6, SMP 1–3, SMA 1–3),
 * tapi ditampilkan sebagai kelas nasional: SMP tingkat 1 = "Kelas 7", SMA tingkat 1 = "Kelas 10".
 */
export type Jenjang = 'sd' | 'smp' | 'sma';

const KELAS_OFFSET: Record<Jenjang, number> = { sd: 0, smp: 6, sma: 9 };

export const JENJANG_OPTIONS: ReadonlyArray<{
  value: Jenjang;
  label: string;
  jumlahTingkat: number;
}> = [
  { value: 'sd', label: 'SD / MI (Kelas 1–6)', jumlahTingkat: 6 },
  { value: 'smp', label: 'SMP / MTs (Kelas 7–9)', jumlahTingkat: 3 },
  { value: 'sma', label: 'SMA / SMK / MA (Kelas 10–12)', jumlahTingkat: 3 },
];

export function isJenjang(v: unknown): v is Jenjang {
  return v === 'sd' || v === 'smp' || v === 'sma';
}

/** Nomor kelas nasional dari tingkat relatif. Tanpa jenjang → tingkat apa adanya. */
export function kelasNumber(tingkat: number, jenjang?: string | null): number {
  return isJenjang(jenjang) ? tingkat + KELAS_OFFSET[jenjang] : tingkat;
}

/** Label tampilan, mis. "Kelas 7". Tanpa jenjang → "Tingkat N". */
export function kelasLabel(tingkat: number | null | undefined, jenjang?: string | null): string {
  if (tingkat === null || tingkat === undefined) return '-';
  return isJenjang(jenjang) ? `Kelas ${kelasNumber(tingkat, jenjang)}` : `Tingkat ${tingkat}`;
}

export function jenjangLabel(jenjang?: string | null): string {
  return JENJANG_OPTIONS.find((o) => o.value === jenjang)?.label ?? '-';
}
