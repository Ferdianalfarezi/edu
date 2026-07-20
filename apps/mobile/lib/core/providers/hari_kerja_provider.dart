import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../di/providers.dart';

/// The tenant's working days setting.
/// - `5_hari`: Monday–Friday
/// - `6_hari`: Monday–Saturday (default)
enum HariKerja {
  lima('5_hari'),
  enam('6_hari');

  const HariKerja(this.value);
  final String value;

  static HariKerja fromString(String? value) {
    if (value == '5_hari') return HariKerja.lima;
    return HariKerja.enam; // default
  }

  /// Whether Saturday is an active school day.
  bool get includeSaturday => this == HariKerja.enam;
}

/// Provider that fetches and caches the tenant's hari_kerja setting.
///
/// Fetches from GET /tenants/profile which returns { hari_kerja: '5_hari' | '6_hari' }.
/// Accessible by guru role.
final hariKerjaProvider = FutureProvider<HariKerja>((ref) async {
  final apiClient = ref.watch(apiClientProvider);

  try {
    final response = await apiClient.dio.get('/tenants/profile');
    final data = response.data as Map<String, dynamic>;
    final value = data['hari_kerja'] as String?;
    return HariKerja.fromString(value);
  } catch (_) {
    // Default to 6_hari if unable to fetch
    return HariKerja.enam;
  }
});
