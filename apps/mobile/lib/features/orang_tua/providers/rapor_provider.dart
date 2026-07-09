import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:logger/logger.dart';

import '../../../core/di/providers.dart';
import '../models/rapor_models.dart';

final _logger = Logger(printer: SimplePrinter());

/// Fetches the list of finalized rapor periods for a given child.
///
/// API: GET /rapor/siswa/:siswaId (not /rapor/anak/:siswaId)
/// Returns: { data: [{ rapor_id, periode, tahun_ajaran, nilai, peringkat, rata_rata, ... }] }
/// Only returns periods with status = 'final'.
/// Requirements: 39.1, 39.2
final childRaporPeriodsProvider = FutureProvider.autoDispose
    .family<List<RaporPeriode>, String>((ref, siswaId) async {
  final apiClient = ref.watch(apiClientProvider);

  try {
    final response = await apiClient.dio.get('/rapor/siswa/$siswaId');
    final data = response.data as Map<String, dynamic>;
    final items = (data['data'] as List<dynamic>?) ?? [];

    return items
        .map((e) => RaporPeriode.fromJson(e as Map<String, dynamic>))
        .toList();
  } catch (e) {
    _logger.e('Failed to fetch rapor periods for siswa $siswaId: $e');
    rethrow;
  }
});

/// Params for fetching rapor detail.
class RaporDetailParams {
  const RaporDetailParams({
    required this.siswaId,
    required this.periodeId,
  });

  final String siswaId;
  final String periodeId;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is RaporDetailParams &&
          other.siswaId == siswaId &&
          other.periodeId == periodeId;

  @override
  int get hashCode => Object.hash(siswaId, periodeId);
}

/// Fetches full rapor detail for a specific child + period.
///
/// API: GET /rapor/siswa/:siswaId (same endpoint — returns all periods with full data)
/// The API returns all periods in one response, so we filter for the target period.
/// Includes: nilai per mapel, komponen, capaian_pembelajaran, P5, catatan_wali_kelas, peringkat, rata_rata
/// Requirements: 39.3, 39.5
final childRaporDetailProvider = FutureProvider.autoDispose
    .family<RaporDetail, RaporDetailParams>((ref, params) async {
  final apiClient = ref.watch(apiClientProvider);

  try {
    final response = await apiClient.dio.get(
      '/rapor/siswa/${params.siswaId}',
    );
    final data = response.data as Map<String, dynamic>;
    final items = (data['data'] as List<dynamic>?) ?? [];

    // Find the period matching the requested periodeId (rapor_id)
    final periodData = items.firstWhere(
      (e) {
        final map = e as Map<String, dynamic>;
        return (map['rapor_id'] as String?) == params.periodeId ||
            (map['periode_id'] as String?) == params.periodeId ||
            (map['id'] as String?) == params.periodeId;
      },
      orElse: () => items.isNotEmpty ? items.first : <String, dynamic>{},
    ) as Map<String, dynamic>;

    if (periodData.isEmpty) {
      throw Exception('Rapor periode tidak ditemukan');
    }

    return RaporDetail.fromJson(periodData);
  } catch (e) {
    _logger.e(
      'Failed to fetch rapor detail for siswa ${params.siswaId}, '
      'periode ${params.periodeId}: $e',
    );
    rethrow;
  }
});
