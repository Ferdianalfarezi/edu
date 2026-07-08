/// API configuration constants.
class ApiConstants {
  ApiConstants._();

  /// Base URL for the API server.
  /// In production, this should be loaded from environment/config.
  static const String baseUrl = 'https://api-development-672d.up.railway.app';

  /// API version prefix.
  static const String apiPrefix = '/api/v1';

  /// Full API base path.
  static String get apiBaseUrl => '$baseUrl$apiPrefix';

  // Auth endpoints
  static const String login = '/auth/login';
  static const String refresh = '/auth/refresh';
  static const String resetPassword = '/auth/reset-password/request';
  static const String changePassword = '/auth/change-password';

  // Absensi endpoints
  static const String absensiKelasHariIni = '/absensi/kelas-hari-ini';
  static const String absensiSync = '/absensi/sync';

  // Jadwal endpoints
  static const String jadwalToday = '/jadwal/today';

  // Siswa endpoints
  static const String siswa = '/siswa';

  // Jadwal endpoints
  static const String jadwalSaya = '/jadwal/saya';

  // Tagihan endpoints
  static const String tagihanSiswa = '/tagihan/siswa';
  static String tagihanAnak(String siswaId) => '/tagihan/anak/$siswaId';
  static String tagihanBayar(String tagihanId) => '/tagihan/$tagihanId/bayar';
  static String tagihanRiwayat(String tagihanId) =>
      '/tagihan/$tagihanId/riwayat';
  static String transaksiReceipt(String transaksiId) =>
      '/tagihan/transaksi/$transaksiId/bukti';

  // Notifikasi endpoints
  static const String notifikasiRiwayat = '/notifikasi/riwayat';
  static const String notifikasiPreferensi = '/notifikasi/preferensi';

  // Orang Tua endpoints
  static const String anakSaya = '/siswa/anak-saya';
  static String absensiAnak(String siswaId) => '/absensi/anak/$siswaId';

  // Device token
  static const String deviceToken = '/device-token';
}
