import 'package:dio/dio.dart';
import 'package:jwt_decoder/jwt_decoder.dart';

import '../constants/api_constants.dart';
import '../constants/app_constants.dart';
import '../models/auth_state.dart';
import '../models/user_role.dart';
import '../network/api_client.dart';
import 'token_storage.dart';

/// Handles authentication flows for both guru and orang_tua.
///
/// Guru: email + password login
/// Orang Tua: phone number only (no password)
///
/// After successful login, decodes the JWT to determine the user's role
/// and returns the appropriate AuthState for routing.
class AuthService {
  AuthService({
    required ApiClient apiClient,
    required TokenStorage tokenStorage,
  })  : _apiClient = apiClient,
        _tokenStorage = tokenStorage;

  final ApiClient _apiClient;
  final TokenStorage _tokenStorage;

  /// Login with email + password (guru).
  Future<AuthState> loginWithEmail({
    required String email,
    required String password,
  }) async {
    final response = await _apiClient.dio.post(
      ApiConstants.login,
      data: {
        'email': email,
        'password': password,
        'platform': AppConstants.platformMobile,
      },
    );

    return _handleLoginResponse(response);
  }

  /// Login with phone number only (orang_tua).
  Future<AuthState> loginWithPhone({
    required String phone,
  }) async {
    final response = await _apiClient.dio.post(
      ApiConstants.login,
      data: {
        'phone': phone,
        'platform': AppConstants.platformMobile,
      },
    );

    return _handleLoginResponse(response);
  }

  /// Restore session from stored tokens.
  /// Returns the auth state if tokens are valid, otherwise unauthenticated.
  Future<AuthState> restoreSession() async {
    final accessToken = await _tokenStorage.getAccessToken();
    if (accessToken == null) {
      return const AuthState.unauthenticated();
    }

    // Check if token is expired
    if (JwtDecoder.isExpired(accessToken)) {
      // Try to refresh
      final refreshToken = await _tokenStorage.getRefreshToken();
      if (refreshToken == null) {
        await _tokenStorage.clearTokens();
        return const AuthState.unauthenticated();
      }

      try {
        final response = await _apiClient.dio.post(
          ApiConstants.refresh,
          data: {'refresh_token': refreshToken},
        );

        if (response.statusCode == 200 || response.statusCode == 201) {
          final data = response.data as Map<String, dynamic>;
          await _tokenStorage.saveAccessToken(data['access_token'] as String);
          if (data.containsKey('refresh_token')) {
            await _tokenStorage.saveRefreshToken(data['refresh_token'] as String);
          }
          return _parseTokenToState(data['access_token'] as String, data);
        }
      } catch (_) {
        await _tokenStorage.clearTokens();
        return const AuthState.unauthenticated();
      }
    }

    return _parseTokenToState(accessToken, null);
  }

  /// Logout: clear stored tokens.
  Future<void> logout() async {
    await _tokenStorage.clearTokens();
  }

  /// Request password reset email for guru.
  Future<void> requestPasswordReset({required String email}) async {
    await _apiClient.dio.post(
      ApiConstants.resetPassword,
      data: {'email': email},
    );
  }

  /// Change password (for must_change_password flow).
  Future<void> changePassword({
    required String oldPassword,
    required String newPassword,
  }) async {
    await _apiClient.dio.post(
      ApiConstants.changePassword,
      data: {
        'old_password': oldPassword,
        'new_password': newPassword,
      },
    );
  }

  /// Handle login API response: store tokens and parse auth state.
  Future<AuthState> _handleLoginResponse(Response response) async {
    final data = response.data as Map<String, dynamic>;

    final accessToken = data['access_token'] as String;
    final refreshToken = data['refresh_token'] as String;

    await _tokenStorage.saveAccessToken(accessToken);
    await _tokenStorage.saveRefreshToken(refreshToken);

    return _parseTokenToState(accessToken, data);
  }

  /// Decode JWT and extract user info for auth state.
  AuthState _parseTokenToState(String token, Map<String, dynamic>? responseData) {
    final decoded = JwtDecoder.decode(token);

    final role = UserRole.fromString(decoded['role'] as String?);
    final userId = decoded['sub'] as String?;
    final tenantId = decoded['tenant_id'] as String?;
    final tenants = (decoded['tenants'] as List<dynamic>?)
        ?.map((e) => e as String)
        .toList();

    // User info from response data (not in JWT)
    String? userName;
    bool mustChangePassword = false;
    if (responseData != null) {
      final userMap = responseData['user'] as Map<String, dynamic>?;
      userName = userMap?['name'] as String?;
      mustChangePassword =
          (responseData['must_change_password'] as bool?) ??
          (userMap?['must_change_password'] as bool?) ??
          false;
    }

    return AuthState(
      isAuthenticated: true,
      userId: userId,
      role: role,
      tenantId: tenantId,
      tenants: tenants,
      userName: userName,
      mustChangePassword: mustChangePassword,
    );
  }
}
