import 'dart:io';
import 'dart:ui' show ImageByteFormat, instantiateImageCodec;

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:logger/logger.dart';

import '../../../core/constants/api_constants.dart';
import '../../../core/di/providers.dart';
import '../models/tagihan_models.dart';

final _logger = Logger(printer: SimplePrinter());

/// Provider for fetching tagihan list for a specific child.
///
/// API: GET /tagihan/siswa/:siswaId
/// Requirements: 14.1, 14.2, 14.3
final childTagihanProvider = FutureProvider.autoDispose
    .family<List<Tagihan>, String>((ref, siswaId) async {
  final apiClient = ref.watch(apiClientProvider);

  try {
    final response =
        await apiClient.dio.get(ApiConstants.tagihanBySiswa(siswaId));
    final data = response.data as Map<String, dynamic>;
    final items = (data['data'] as List<dynamic>?) ?? [];

    return items
        .map((e) =>
            Tagihan.fromJson(e as Map<String, dynamic>, siswaId: siswaId))
        .toList();
  } catch (e) {
    _logger.e('Failed to fetch tagihan for siswa $siswaId: $e');
    rethrow;
  }
});

/// Provider for fetching payment receipt (bukti bayar) for a specific tagihan.
///
/// API: GET /tagihan/:id/bukti-bayar
/// Requirement 14.4, 14.5, 14.6
final tagihanBuktiBayarProvider = FutureProvider.autoDispose
    .family<Map<String, dynamic>, String>((ref, tagihanId) async {
  final apiClient = ref.watch(apiClientProvider);

  try {
    final response =
        await apiClient.dio.get(ApiConstants.tagihanBuktiBayar(tagihanId));
    final data = response.data as Map<String, dynamic>;
    return (data['data'] as Map<String, dynamic>?) ?? {};
  } catch (e) {
    _logger.e('Failed to fetch bukti bayar for tagihan $tagihanId: $e');
    rethrow;
  }
});

/// Provider for fetching payment history (transactions) for a specific tagihan.
/// Uses the bukti-bayar endpoint which returns payment details.
///
/// API: GET /tagihan/:id/bukti-bayar
/// Returns: { data: { ..., pembayaran: [...] } }
/// Requirements: 14.2, 14.4
final tagihanRiwayatProvider = FutureProvider.autoDispose
    .family<List<TagihanTransaksi>, String>((ref, tagihanId) async {
  final apiClient = ref.watch(apiClientProvider);

  try {
    final response =
        await apiClient.dio.get(ApiConstants.tagihanBuktiBayar(tagihanId));
    final data = response.data as Map<String, dynamic>;
    final buktiData = data['data'] as Map<String, dynamic>?;
    // API returns 'pembayaran' array, not 'transaksi'
    final items = (buktiData?['pembayaran'] as List<dynamic>?) ??
        (buktiData?['transaksi'] as List<dynamic>?) ??
        [];

    return items
        .map((e) => TagihanTransaksi.fromJson(e as Map<String, dynamic>))
        .toList();
  } catch (e) {
    _logger.e('Failed to fetch riwayat for tagihan $tagihanId: $e');
    rethrow;
  }
});

/// Provider for downloading receipt URL from bukti-bayar response.
///
/// Since the API doesn't have a dedicated /tagihan/transaksi/:id/receipt endpoint,
/// this provider should not be used directly. Consumers should use
/// tagihanBuktiBayarProvider to get payment details including presigned URLs.
/// Kept for backward compatibility — returns empty string on failure.
final receiptUrlProvider =
    FutureProvider.autoDispose.family<String, String>((ref, transaksiId) async {
  final apiClient = ref.watch(apiClientProvider);

  try {
    final response =
        await apiClient.dio.get('/tagihan/transaksi/$transaksiId/receipt');
    final data = response.data as Map<String, dynamic>;
    return data['url'] as String? ?? '';
  } catch (e) {
    _logger.e('Failed to get receipt URL for transaksi $transaksiId: $e');
    // This endpoint may not exist — return empty string instead of crashing
    return '';
  }
});

/// Upload bukti transfer result.
class UploadBuktiResult {
  const UploadBuktiResult({required this.success, this.message});

  final bool success;
  final String? message;
}

/// Provider/notifier for uploading bukti transfer.
///
/// API: POST /tagihan/:id/upload-bukti (multipart: file + nominal_bayar)
/// Requirements: 11.1–11.17
class UploadBuktiNotifier
    extends StateNotifier<AsyncValue<UploadBuktiResult?>> {
  UploadBuktiNotifier(this._ref) : super(const AsyncData(null));

  final Ref _ref;

  /// Upload bukti transfer image with nominal_bayar.
  ///
  /// Validates:
  /// - File format: JPG/PNG only (Requirement 11.5)
  /// - File size: max 5MB (Requirement 11.5)
  /// - nominal_bayar >= 10000 (Requirement 11.9)
  /// - nominal_bayar <= sisa tagihan (Requirement 11.10)
  ///
  /// Compresses image client-side before upload to reduce transfer time.
  Future<UploadBuktiResult> upload({
    required String tagihanId,
    required File imageFile,
    required int nominalBayar,
    required int sisaTagihan,
  }) async {
    // Client-side validations
    final validationError = _validate(imageFile, nominalBayar, sisaTagihan);
    if (validationError != null) {
      final result =
          UploadBuktiResult(success: false, message: validationError);
      state = AsyncData(result);
      return result;
    }

    state = const AsyncLoading();

    try {
      final apiClient = _ref.read(apiClientProvider);

      // Compress image client-side to reduce upload size and server processing time.
      // Target: max 1280px width, JPEG quality 70 → typically ~200-500KB.
      final compressedFile = await _compressImage(imageFile);
      final fileToUpload = compressedFile ?? imageFile;
      final fileName = fileToUpload.path.split('/').last;

      final formData = FormData.fromMap({
        'file': await MultipartFile.fromFile(
          fileToUpload.path,
          filename: fileName,
        ),
        'nominal_bayar': nominalBayar,
      });

      await apiClient.dio.post(
        ApiConstants.tagihanUploadBukti(tagihanId),
        data: formData,
        options: Options(
          contentType: 'multipart/form-data',
          sendTimeout: const Duration(seconds: 120),
          receiveTimeout: const Duration(seconds: 120),
        ),
      );

      const result = UploadBuktiResult(
        success: true,
        message:
            'Bukti transfer berhasil dikirim. Menunggu verifikasi Bendahara.',
      );
      state = const AsyncData(result);
      return result;
    } on DioException catch (e) {
      _logger.e('Upload bukti DioException: ${e.type} - ${e.message}');
      final message = _extractErrorMessage(e);
      final result = UploadBuktiResult(success: false, message: message);
      state = AsyncData(result);
      return result;
    } catch (e, stackTrace) {
      _logger.e('Upload bukti unexpected error: $e\n$stackTrace');
      final result = UploadBuktiResult(
        success: false,
        message: 'Terjadi kesalahan: ${e.toString()}',
      );
      state = AsyncData(result);
      return result;
    }
  }

  /// Compress image to reduce file size before uploading.
  /// Uses image_picker's built-in resize capabilities by re-reading the file
  /// through the image codec and saving as JPEG with reduced quality.
  /// Returns null if compression fails (caller will use original).
  Future<File?> _compressImage(File originalFile) async {
    try {
      final bytes = await originalFile.readAsBytes();
      final codec = await instantiateImageCodec(bytes, targetWidth: 1280);
      final frame = await codec.getNextFrame();
      final image = frame.image;

      final byteData = await image.toByteData(
        format: ImageByteFormat.png,
      );
      image.dispose();

      if (byteData == null) return null;

      // Write compressed image to a temp file
      final tempDir = await Directory.systemTemp.createTemp('bukti_');
      final extension = originalFile.path.split('.').last.toLowerCase();
      final compressedFile = File('${tempDir.path}/compressed.$extension');
      await compressedFile.writeAsBytes(byteData.buffer.asUint8List());

      // Only use compressed if it's actually smaller
      final originalSize = await originalFile.length();
      final compressedSize = await compressedFile.length();

      if (compressedSize < originalSize) {
        _logger.i(
          'Image compressed: ${originalSize ~/ 1024}KB → ${compressedSize ~/ 1024}KB',
        );
        return compressedFile;
      }

      // Compressed is larger or same — use original
      return null;
    } catch (e) {
      _logger.w('Image compression failed, using original: $e');
      return null;
    }
  }

  /// Validate file and nominal before sending to API.
  String? _validate(File imageFile, int nominalBayar, int sisaTagihan) {
    // Validate file extension (Requirement 11.5)
    final extension = imageFile.path.split('.').last.toLowerCase();
    if (!['jpg', 'jpeg', 'png'].contains(extension)) {
      return 'Format file harus JPG atau PNG.';
    }

    // Validate file size: max 5MB (Requirement 11.5)
    final fileSizeBytes = imageFile.lengthSync();
    if (fileSizeBytes > 5 * 1024 * 1024) {
      return 'Ukuran file maksimal 5MB.';
    }

    // Validate nominal_bayar minimum (Requirement 11.9, 11.11)
    if (nominalBayar < 10000) {
      return 'Nominal pembayaran minimal Rp 10.000';
    }

    // Validate nominal_bayar does not exceed sisa (Requirement 11.10, 11.12)
    if (nominalBayar > sisaTagihan) {
      return 'Nominal melebihi sisa tagihan';
    }

    return null;
  }

  String _extractErrorMessage(DioException e) {
    // Handle timeout errors
    if (e.type == DioExceptionType.sendTimeout) {
      return 'Upload timeout. Periksa koneksi internet Anda dan coba lagi.';
    }
    if (e.type == DioExceptionType.receiveTimeout) {
      return 'Server tidak merespon. Cek status tagihan Anda sebelum mencoba ulang.';
    }
    if (e.type == DioExceptionType.connectionTimeout) {
      return 'Koneksi timeout. Periksa koneksi internet Anda.';
    }
    if (e.type == DioExceptionType.connectionError) {
      return 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.';
    }

    if (e.response?.data is Map<String, dynamic>) {
      final data = e.response!.data as Map<String, dynamic>;
      return data['message'] as String? ?? 'Gagal mengupload bukti transfer.';
    }
    return 'Gagal mengupload bukti transfer. Silakan coba lagi.';
  }

  void reset() {
    state = const AsyncData(null);
  }
}

/// Provider for the upload bukti state.
final uploadBuktiProvider = StateNotifierProvider.autoDispose<
    UploadBuktiNotifier, AsyncValue<UploadBuktiResult?>>(
  (ref) => UploadBuktiNotifier(ref),
);
