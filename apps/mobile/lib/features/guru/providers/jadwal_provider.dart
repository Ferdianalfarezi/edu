import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../models/jadwal_entry.dart';

/// Days of the week available for the schedule filter.
const List<String> hariList = [
  'senin',
  'selasa',
  'rabu',
  'kamis',
  'jumat',
  'sabtu',
];

/// Map from Dart's DateTime.weekday (1=Monday) to Indonesian day name.
String _getTodayHari() {
  final weekday = DateTime.now().weekday; // 1=Mon, ..., 6=Sat, 7=Sun
  if (weekday >= 1 && weekday <= 6) {
    return hariList[weekday - 1];
  }
  // Sunday (7) has no school — default to senin
  return 'senin';
}

/// Provider for the currently selected day filter.
/// Defaults to today's day.
final selectedHariProvider = StateProvider<String>((ref) {
  return _getTodayHari();
});

/// Provider that fetches the guru's teaching schedule for the selected day.
/// Accepts [hari] parameter and returns [AsyncValue<JadwalSayaResponse>].
///
/// Requirements: 33.1, 33.2, 33.3, 33.4
final jadwalSayaProvider =
    FutureProvider.autoDispose.family<JadwalSayaResponse, String>(
  (ref, hari) async {
    final apiClient = ref.watch(apiClientProvider);

    final response = await apiClient.dio.get(
      '/jadwal/saya',
      queryParameters: {'hari': hari},
    );

    return JadwalSayaResponse.fromJson(response.data as Map<String, dynamic>);
  },
);
