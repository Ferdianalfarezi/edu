import 'user_role.dart';

/// Represents the current authentication state.
class AuthState {
  const AuthState({
    required this.isAuthenticated,
    this.userId,
    this.role,
    this.tenantId,
    this.tenants,
    this.userName,
    this.mustChangePassword = false,
  });

  /// Default unauthenticated state.
  const AuthState.unauthenticated()
      : isAuthenticated = false,
        userId = null,
        role = null,
        tenantId = null,
        tenants = null,
        userName = null,
        mustChangePassword = false;

  final bool isAuthenticated;
  final String? userId;
  final UserRole? role;
  final String? tenantId;
  final List<String>? tenants;
  final String? userName;

  /// Whether the user must change their password before proceeding.
  /// Only applicable for guru users who have a default/temporary password.
  final bool mustChangePassword;

  AuthState copyWith({
    bool? isAuthenticated,
    String? userId,
    UserRole? role,
    String? tenantId,
    List<String>? tenants,
    String? userName,
    bool? mustChangePassword,
  }) {
    return AuthState(
      isAuthenticated: isAuthenticated ?? this.isAuthenticated,
      userId: userId ?? this.userId,
      role: role ?? this.role,
      tenantId: tenantId ?? this.tenantId,
      tenants: tenants ?? this.tenants,
      userName: userName ?? this.userName,
      mustChangePassword: mustChangePassword ?? this.mustChangePassword,
    );
  }
}
