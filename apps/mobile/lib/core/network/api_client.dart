import 'package:dio/dio.dart';

import '../constants/api_constants.dart';
import 'jwt_interceptor.dart';
import '../services/token_storage.dart';

/// Configured Dio HTTP client for API communication.
class ApiClient {
  ApiClient({
    required TokenStorage tokenStorage,
    required void Function() onAuthFailure,
  }) {
    _dio = Dio(
      BaseOptions(
        baseUrl: ApiConstants.apiBaseUrl,
        connectTimeout: const Duration(seconds: 30),
        receiveTimeout: const Duration(seconds: 30),
        sendTimeout: const Duration(seconds: 30),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      ),
    );

    _dio.interceptors.add(
      JwtInterceptor(
        dio: _dio,
        tokenStorage: tokenStorage,
        onAuthFailure: onAuthFailure,
      ),
    );

    _dio.interceptors.add(
      LogInterceptor(
        requestBody: true,
        responseBody: true,
        error: true,
      ),
    );
  }

  late final Dio _dio;

  /// Access the underlying Dio instance for direct use.
  Dio get dio => _dio;
}
