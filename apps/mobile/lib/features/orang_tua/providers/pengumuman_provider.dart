import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:logger/logger.dart';

import '../../../core/constants/api_constants.dart';
import '../../../core/di/providers.dart';
import '../models/pengumuman_models.dart';

final _logger = Logger(printer: SimplePrinter());

/// Provider for fetching pengumuman (announcement) detail.
///
/// API: GET /pengumuman/:id
/// Requirements: 6.3, 6.4, 6.5
final pengumumanDetailProvider = FutureProvider.autoDispose
    .family<PengumumanDetail, String>((ref, pengumumanId) async {
  final apiClient = ref.watch(apiClientProvider);

  try {
    final response =
        await apiClient.dio.get(ApiConstants.pengumumanDetail(pengumumanId));
    final data = response.data as Map<String, dynamic>;

    return PengumumanDetail.fromJson(data);
  } catch (e) {
    _logger.e('Failed to fetch pengumuman detail $pengumumanId: $e');
    rethrow;
  }
});
