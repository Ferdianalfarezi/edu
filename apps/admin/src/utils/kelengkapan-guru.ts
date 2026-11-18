/**
 * Data diri guru + aturan kelengkapan (dipakai halaman Guru dan profil guru sendiri).
 */
export interface ProfilGuru {
  id: string;
  nama: string;
  email: string | null;
  telepon: string | null;
  nomorInduk: string | null;
  tanggalLahir: string | null;
  pendidikanTerakhir: string | null;
  kampus: string | null;
  alamat: string | null;
}

export const PENDIDIKAN = ['SMA/SMK', 'D1', 'D2', 'D3', 'D4', 'S1', 'S2', 'S3'];

export type FieldWajib = 'telepon' | 'tanggalLahir' | 'pendidikanTerakhir' | 'kampus' | 'alamat';

export const LABEL_FIELD: Record<FieldWajib, string> = {
  telepon: 'telepon',
  tanggalLahir: 'tanggal lahir',
  pendidikanTerakhir: 'pendidikan',
  kampus: 'kampus',
  alamat: 'alamat',
};

/** Field wajib yang masih kosong. NUPTK/NIP opsional; kampus tidak wajib untuk SMA/SMK. */
export function fieldKurang(g: Omit<ProfilGuru, 'id' | 'nama' | 'email'>): FieldWajib[] {
  const kurang: FieldWajib[] = [];
  if (!g.telepon) kurang.push('telepon');
  if (!g.tanggalLahir) kurang.push('tanggalLahir');
  if (!g.pendidikanTerakhir) kurang.push('pendidikanTerakhir');
  if (g.pendidikanTerakhir !== 'SMA/SMK' && !g.kampus) kurang.push('kampus');
  if (!g.alamat) kurang.push('alamat');
  return kurang;
}

/** Label field yang masih kosong, mis. ['telepon', 'alamat']. */
export function dataKurang(g: Omit<ProfilGuru, 'id' | 'nama' | 'email'>): string[] {
  return fieldKurang(g).map((f) => LABEL_FIELD[f]);
}
