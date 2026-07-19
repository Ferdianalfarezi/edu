/// API configuration constants.
class ApiConstants {
  ApiConstants._();

  /// Base URL for the API server.
  /// Uses compile-time environment variable with fallback to development URL.
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://api-development-672d.up.railway.app',
  );

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

  // Tagihan endpoints — paths must match API controller routes
  static const String tagihanSiswa = '/tagihan/siswa';
  static String tagihanBySiswa(String siswaId) => '/tagihan/siswa/$siswaId';
  static String tagihanUploadBukti(String tagihanId) =>
      '/tagihan/$tagihanId/upload-bukti';
  static String tagihanBuktiBayar(String tagihanId) =>
      '/tagihan/$tagihanId/bukti-bayar';

  // Pengumuman endpoints
  static String pengumumanDetail(String pengumumanId) =>
      '/pengumuman/$pengumumanId';

  // Notifikasi endpoints
  static const String notifikasiRiwayat = '/notifikasi/riwayat';
  static const String notifikasiPreferensi = '/notifikasi/preferensi';

  // Orang Tua endpoints
  static const String anakSaya = '/siswa/anak-saya';
  static String absensiAnak(String siswaId) => '/absensi/anak/$siswaId';

  // Device token
  static const String deviceToken = '/device-token';
}
