import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../constants/api_constants.dart';
import '../database/app_database.dart';
import '../models/auth_state.dart';
import '../network/api_client.dart';
import '../router/app_router.dart';
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

    // Register device token after session restore if authenticated
    if (newState.isAuthenticated) {
      _registerDeviceToken();
    }
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

    // Register device token after login
    _registerDeviceToken();
  }

  /// Login as orang_tua with phone number only.
  Future<void> loginAsOrangTua({required String phone}) async {
    final authService = _ref.read(authServiceProvider);
    final newState = await authService.loginWithPhone(phone: phone);
    state = newState;

    // Register device token after login
    _registerDeviceToken();
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

  /// Register FCM device token with the backend (fire-and-forget).
  void _registerDeviceToken() {
    final notificationService = _ref.read(notificationServiceProvider);
    final apiClient = _ref.read(apiClientProvider);

    notificationService.getToken().then((token) {
      if (token == null) {
        debugPrint('[DeviceToken] FCM token is null, skipping registration');
        return;
      }
      debugPrint(
          '[DeviceToken] Registering FCM token: ${token.substring(0, 10)}...');
      final platform = Platform.isIOS ? 'ios' : 'android';
      apiClient.dio.post(
        ApiConstants.deviceToken,
        data: {
          'fcm_token': token,
          'platform': platform,
        },
      ).then((response) {
        debugPrint(
            '[DeviceToken] Registration success: ${response.statusCode}');
      }).catchError((error) {
        debugPrint('[DeviceToken] Registration failed: $error');
      });
    }).catchError((error) {
      debugPrint('[DeviceToken] Failed to get FCM token: $error');
    });
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
  final router = ref.read(appRouterProvider);

  return NotificationService(
    onTokenRefresh: (token) {
      // Re-register token if user is authenticated
      final authState = ref.read(authStateProvider);
      if (authState.isAuthenticated) {
        final apiClient = ref.read(apiClientProvider);
        final platform = Platform.isIOS ? 'ios' : 'android';
        apiClient.dio.post(
          ApiConstants.deviceToken,
          data: {
            'fcm_token': token,
            'platform': platform,
          },
        ).ignore();
      }
    },
    onNotificationTap: (data) {
      handleNotificationNavigation(data, router);
    },
  );
});

/// Handle navigation from notification data payload.
///
/// Checks `tipe` field and navigates to the appropriate screen.
/// Requirements 6.1, 6.2: Navigate to pengumuman detail on tap.
void handleNotificationNavigation(
  Map<String, dynamic> data,
  GoRouter router,
) {
  final tipe = data['tipe'] as String?;

  if (tipe == 'pengumuman') {
    final pengumumanId = data['pengumuman_id'] as String?;
    if (pengumumanId != null && pengumumanId.isNotEmpty) {
      router.go(
        AppRoutes.orangTuaPengumumanDetail
            .replaceFirst(':pengumumanId', pengumumanId),
      );
    }
  }
}

// Connectivity providers are accessible directly from:
// import '../network/connectivity_service.dart';
