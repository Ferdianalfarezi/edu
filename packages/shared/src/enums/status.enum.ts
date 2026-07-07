/**
 * Status kehadiran siswa.
 * Only one record per student per day.
 */
export enum StatusKehadiran {
  HADIR = 'hadir',
  IZIN = 'izin',
  SAKIT = 'sakit',
  ALPA = 'alpa',
}

/**
 * Status pembayaran tagihan SPP.
 */
export enum StatusPembayaran {
  BELUM_BAYAR = 'belum_bayar',
  MENUNGGU_VERIFIKASI = 'menunggu_verifikasi',
  CICILAN = 'cicilan',
  LUNAS = 'lunas',
  DITOLAK = 'ditolak',
  DIBATALKAN = 'dibatalkan',
}

/**
 * Status siswa dalam sekolah.
 */
export enum StatusSiswa {
  AKTIF = 'aktif',
  PINDAH_SEKOLAH = 'pindah_sekolah',
  KELUAR = 'keluar',
  ALUMNI = 'alumni',
}

/**
 * Status tahun ajaran.
 */
export enum StatusTahunAjaran {
  DISIAPKAN = 'disiapkan',
  AKTIF = 'aktif',
  SELESAI = 'selesai',
}

/**
 * Platform login.
 */
export enum Platform {
  ADMIN_PANEL = 'admin_panel',
  MOBILE = 'mobile',
}

/**
 * Metode pembayaran manual.
 */
export enum MetodePembayaran {
  TUNAI = 'tunai',
  TRANSFER_MANUAL = 'transfer_manual',
}

/**
 * Periode rapor.
 */
export enum PeriodeRapor {
  UTS_SEMESTER_1 = 'uts_semester_1',
  SEMESTER_1 = 'semester_1',
  UTS_SEMESTER_2 = 'uts_semester_2',
  SEMESTER_2 = 'semester_2',
}
