import 'package:dio/dio.dart';

import '../constants/api_constants.dart';
import '../services/token_storage.dart';

/// Dio interceptor that handles JWT authentication:
/// - Attaches access token to every request
/// - Auto-refreshes token on 401 responses
/// - Retries the original request with new token
/// - Calls [onAuthFailure] when refresh also fails (forces re-login)
class JwtInterceptor extends Interceptor {
  JwtInterceptor({
    required Dio dio,
    required TokenStorage tokenStorage,
    required this.onAuthFailure,
  })  : _dio = dio,
        _tokenStorage = tokenStorage;

  final Dio _dio;
  final TokenStorage _tokenStorage;
  final void Function() onAuthFailure;

  bool _isRefreshing = false;
  final List<_RetryRequest> _pendingRequests = [];

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    // Skip token attachment for auth endpoints
    if (_isAuthEndpoint(options.path)) {
      return handler.next(options);
    }

    final token = await _tokenStorage.getAccessToken();
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }

    return handler.next(options);
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    // Only handle 401 (Unauthorized) for non-auth endpoints
    if (err.response?.statusCode != 401 ||
        _isAuthEndpoint(err.requestOptions.path)) {
      return handler.next(err);
    }

    // Queue this request for retry after refresh
    if (_isRefreshing) {
      _pendingRequests.add(_RetryRequest(err.requestOptions, handler));
      return;
    }

    _isRefreshing = true;

    try {
      final refreshed = await _refreshToken();
      if (refreshed) {
        // Retry the original request with new token
        final newToken = await _tokenStorage.getAccessToken();
        err.requestOptions.headers['Authorization'] = 'Bearer $newToken';

        final response = await _dio.fetch(err.requestOptions);
        handler.resolve(response);

        // Retry all pending requests
        _retryPendingRequests();
      } else {
        _rejectPendingRequests(err);
        onAuthFailure();
        handler.next(err);
      }
    } catch (e) {
      _rejectPendingRequests(err);
      onAuthFailure();
      handler.next(err);
    } finally {
      _isRefreshing = false;
    }
  }

  /// Attempt to refresh the access token using the stored refresh token.
  Future<bool> _refreshToken() async {
    final refreshToken = await _tokenStorage.getRefreshToken();
    if (refreshToken == null) return false;

    try {
      // Use a separate Dio instance to avoid interceptor loops
      final refreshDio = Dio(BaseOptions(
        baseUrl: ApiConstants.apiBaseUrl,
        headers: {'Content-Type': 'application/json'},
      ));

      final response = await refreshDio.post(
        ApiConstants.refresh,
        data: {'refresh_token': refreshToken},
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        final data = response.data as Map<String, dynamic>;
        await _tokenStorage.saveAccessToken(data['access_token'] as String);
        if (data.containsKey('refresh_token')) {
          await _tokenStorage.saveRefreshToken(data['refresh_token'] as String);
        }
        return true;
      }
    } catch (_) {
      // Refresh failed — clear tokens
      await _tokenStorage.clearTokens();
    }

    return false;
  }

  void _retryPendingRequests() async {
    final pending = List<_RetryRequest>.from(_pendingRequests);
    _pendingRequests.clear();

    for (final request in pending) {
      try {
        final newToken = await _tokenStorage.getAccessToken();
        request.options.headers['Authorization'] = 'Bearer $newToken';
        final response = await _dio.fetch(request.options);
        request.handler.resolve(response);
      } catch (e) {
        request.handler.reject(
          DioException(requestOptions: request.options, error: e),
        );
      }
    }
  }

  void _rejectPendingRequests(DioException err) {
    final pending = List<_RetryRequest>.from(_pendingRequests);
    _pendingRequests.clear();

    for (final request in pending) {
      request.handler.reject(
        DioException(
          requestOptions: request.options,
          error: err.error,
          response: err.response,
        ),
      );
    }
  }

  bool _isAuthEndpoint(String path) {
    return path == ApiConstants.login ||
        path == ApiConstants.refresh ||
        path == ApiConstants.resetPassword;
  }
}

class _RetryRequest {
  _RetryRequest(this.options, this.handler);

  final RequestOptions options;
  final ErrorInterceptorHandler handler;
}
