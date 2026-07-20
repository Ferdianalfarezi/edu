import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/providers/hari_kerja_provider.dart';
import '../models/jadwal_entry.dart';

/// All days of the week (full set for 6_hari).
const List<String> allHariList = [
  'senin',
  'selasa',
  'rabu',
  'kamis',
  'jumat',
  'sabtu',
];

/// Days available for the schedule filter (backward-compatible alias).
/// Consumers that need the filtered list should use [activeHariListProvider].
const List<String> hariList = allHariList;

/// Provider that returns the active school days based on hari_kerja setting.
/// For 5_hari: senin–jumat. For 6_hari: senin–sabtu.
final activeHariListProvider = Provider<List<String>>((ref) {
  final hariKerjaAsync = ref.watch(hariKerjaProvider);
  return hariKerjaAsync.when(
    data: (hariKerja) => hariKerja.includeSaturday
        ? allHariList
        : allHariList.where((h) => h != 'sabtu').toList(),
    loading: () => allHariList, // default to 6 while loading
    error: (_, __) => allHariList,
  );
});

/// Map from Dart's DateTime.weekday (1=Monday) to Indonesian day name.
String _getTodayHari() {
  final weekday = DateTime.now().weekday; // 1=Mon, ..., 6=Sat, 7=Sun
  if (weekday >= 1 && weekday <= 6) {
    return allHariList[weekday - 1];
  }
  // Sunday (7) has no school — default to senin
  return 'senin';
}

/// Provider for the currently selected day filter.
/// Defaults to today's day (or senin if today is not a school day).
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
