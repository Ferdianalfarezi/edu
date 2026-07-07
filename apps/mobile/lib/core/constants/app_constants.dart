/// Application-wide constants.
class AppConstants {
  AppConstants._();

  /// Secure storage keys.
  static const String accessTokenKey = 'access_token';
  static const String refreshTokenKey = 'refresh_token';

  /// User roles.
  static const String roleGuru = 'guru';
  static const String roleOrangTua = 'orang_tua';
  static const String roleAdmin = 'admin';
  static const String roleBendahara = 'bendahara';
  static const String roleKepalaSekolah = 'kepala_sekolah';

  /// Platform identifier for auth requests.
  static const String platformMobile = 'mobile';

  /// Connectivity check interval in seconds.
  static const int connectivityCheckIntervalSeconds = 10;

  /// Max file upload size in bytes (5MB).
  static const int maxUploadSizeBytes = 5 * 1024 * 1024;

  /// Allowed image upload extensions.
  static const List<String> allowedImageExtensions = ['jpg', 'jpeg', 'png'];
}
