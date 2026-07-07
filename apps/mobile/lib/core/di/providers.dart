import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../database/app_database.dart';
import '../models/auth_state.dart';
import '../network/api_client.dart';
import '../network/connectivity_service.dart';
import '../services/auth_service.dart';
import '../services/notification_service.dart';
import '../services/token_storage.dart';

/// Token storage provider.
final tokenStorageProvider = Provider<TokenStorage>((ref) {
  return TokenStorage();
});

/// Auth state notifier — the single source of truth for authentication status.
final authStateProvider =
    StateNotifierProvider<AuthStateNotifier, AuthState>((ref) {
  return AuthStateNotifier(ref);
});

/// Auth state notifier that manages login/logout and session restoration.
class AuthStateNotifier extends StateNotifier<AuthState> {
  AuthStateNotifier(this._ref) : super(const AuthState.unauthenticated());

  final Ref _ref;

  /// Attempt to restore a previous session from stored tokens.
  Future<void> restoreSession() async {
    final authService = _ref.read(authServiceProvider);
    final newState = await authService.restoreSession();
    state = newState;
  }

  /// Login as guru with email and password.
  Future<void> loginAsGuru({
    required String email,
    required String password,
  }) async {
    final authService = _ref.read(authServiceProvider);
    final newState = await authService.loginWithEmail(
      email: email,
      password: password,
    );
    state = newState;
  }

  /// Login as orang_tua with phone number only.
  Future<void> loginAsOrangTua({required String phone}) async {
    final authService = _ref.read(authServiceProvider);
    final newState = await authService.loginWithPhone(phone: phone);
    state = newState;
  }

  /// Logout and clear state.
  Future<void> logout() async {
    final authService = _ref.read(authServiceProvider);
    await authService.logout();
    state = const AuthState.unauthenticated();
  }

  /// Clear the must_change_password flag after successful password change.
  void clearMustChangePassword() {
    state = state.copyWith(mustChangePassword: false);
  }

  /// Force logout (called when token refresh fails).
  void forceLogout() {
    _ref.read(tokenStorageProvider).clearTokens();
    state = const AuthState.unauthenticated();
  }
}

/// API client provider.
final apiClientProvider = Provider<ApiClient>((ref) {
  final tokenStorage = ref.watch(tokenStorageProvider);
  final authNotifier = ref.read(authStateProvider.notifier);

  return ApiClient(
    tokenStorage: tokenStorage,
    onAuthFailure: () => authNotifier.forceLogout(),
  );
});

/// Auth service provider.
final authServiceProvider = Provider<AuthService>((ref) {
  return AuthService(
    apiClient: ref.watch(apiClientProvider),
    tokenStorage: ref.watch(tokenStorageProvider),
  );
});

/// Local database provider.
final appDatabaseProvider = Provider<AppDatabase>((ref) {
  final db = AppDatabase();
  ref.onDispose(() => db.close());
  return db;
});

/// Notification service provider.
final notificationServiceProvider = Provider<NotificationService>((ref) {
  return NotificationService();
});

// Connectivity providers are accessible directly from:
// import '../network/connectivity_service.dart';
