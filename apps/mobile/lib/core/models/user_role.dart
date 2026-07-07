/// Enum representing user roles that can use the mobile app.
enum UserRole {
  guru,
  orangTua;

  /// Parse role string from JWT payload.
  static UserRole? fromString(String? role) {
    switch (role) {
      case 'guru':
        return UserRole.guru;
      case 'orang_tua':
        return UserRole.orangTua;
      default:
        return null;
    }
  }

  String get value {
    switch (this) {
      case UserRole.guru:
        return 'guru';
      case UserRole.orangTua:
        return 'orang_tua';
    }
  }
}
