/**
 * Validation utility untuk form inventaris barang.
 * Diekstrak sebagai pure function agar dapat diuji secara independen dari Vue component.
 */

export const KONDISI_BARANG_VALUES = ['bagus', 'perlu_perbaikan', 'rusak'] as const;
export const SUMBER_DANA_VALUES = ['yayasan', 'unit_sekolah', 'bos'] as const;
export const KATEGORI_VALUES = ['peralatan', 'perlengkapan'] as const;

export type KondisiBarang = (typeof KONDISI_BARANG_VALUES)[number];
export type SumberDana = (typeof SUMBER_DANA_VALUES)[number];
export type KategoriBarang = (typeof KATEGORI_VALUES)[number];

export interface BarangFormInput {
  kondisi_barang?: string | null;
  sumber_dana?: string | null;
  kategori?: string | null;
}

export interface BarangFormValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

/**
 * Validasi field wajib pada form inventaris barang.
 *
 * Aturan:
 * - `kondisi_barang` wajib diisi dengan salah satu nilai enum yang valid
 * - `sumber_dana` wajib diisi dengan salah satu nilai enum yang valid
 * - `kategori` wajib diisi dengan salah satu nilai enum yang valid
 *
 * Jika salah satu atau lebih field kosong/null/undefined, form ditolak dan
 * error inline diberikan per field yang bermasalah.
 */
export function validateBarangForm(form: BarangFormInput): BarangFormValidationResult {
  const errors: Record<string, string> = {};

  if (
    !form.kondisi_barang ||
    !KONDISI_BARANG_VALUES.includes(form.kondisi_barang as KondisiBarang)
  ) {
    errors.kondisi_barang = 'Kondisi barang wajib diisi';
  }

  if (!form.sumber_dana || !SUMBER_DANA_VALUES.includes(form.sumber_dana as SumberDana)) {
    errors.sumber_dana = 'Sumber dana wajib diisi';
  }

  if (!form.kategori || !KATEGORI_VALUES.includes(form.kategori as KategoriBarang)) {
    errors.kategori = 'Kategori wajib diisi';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}
