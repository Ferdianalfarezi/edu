import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:logger/logger.dart';

import '../../../core/di/providers.dart';
import '../models/attendance_models.dart';

final _logger = Logger(printer: SimplePrinter());

/// Provider for the parent's children list, fetched from the API.
///
/// Returns all children across all tenants for cross-tenant parents.
/// Requirements: 21.9, 21.10
final parentChildrenProvider =
    FutureProvider.autoDispose<List<ChildInfo>>((ref) async {
  final apiClient = ref.watch(apiClientProvider);

  try {
    final response = await apiClient.dio.get('/siswa/anak-saya');
    final data = response.data as Map<String, dynamic>;
    final items = (data['data'] as List<dynamic>?) ?? [];

    return items
        .map((e) => ChildInfo.fromJson(e as Map<String, dynamic>))
        .toList();
  } catch (e) {
    _logger.e('Failed to fetch children list: $e');
    rethrow;
  }
});

/// Provider that groups children by school (tenant).
/// Requirement 21.10: multi-school grouping for cross-tenant parents.
final parentChildrenGroupedProvider =
    FutureProvider.autoDispose<List<SchoolChildGroup>>((ref) async {
  final children = await ref.watch(parentChildrenProvider.future);

  final groupMap = <String, List<ChildInfo>>{};
  final tenantNames = <String, String>{};

  for (final child in children) {
    groupMap.putIfAbsent(child.tenantId, () => []).add(child);
    tenantNames.putIfAbsent(child.tenantId, () => child.tenantNama);
  }

  return groupMap.entries.map((entry) {
    return SchoolChildGroup(
      tenantId: entry.key,
      tenantNama: tenantNames[entry.key] ?? '',
      children: entry.value,
    );
  }).toList();
});

/// State holder for the selected child and month.
class AttendanceViewState {
  const AttendanceViewState({
    this.selectedChildId,
    required this.selectedMonth,
    required this.selectedYear,
  });

  final String? selectedChildId;
  final int selectedMonth;
  final int selectedYear;

  AttendanceViewState copyWith({
    String? selectedChildId,
    int? selectedMonth,
    int? selectedYear,
  }) {
    return AttendanceViewState(
      selectedChildId: selectedChildId ?? this.selectedChildId,
      selectedMonth: selectedMonth ?? this.selectedMonth,
      selectedYear: selectedYear ?? this.selectedYear,
    );
  }
}

/// Notifier for the attendance view selection state.
class AttendanceViewNotifier extends StateNotifier<AttendanceViewState> {
  AttendanceViewNotifier()
      : super(AttendanceViewState(
          selectedMonth: DateTime.now().month,
          selectedYear: DateTime.now().year,
        ));

  void selectChild(String siswaId) {
    state = state.copyWith(selectedChildId: siswaId);
  }

  void selectMonth(int month, int year) {
    state = state.copyWith(selectedMonth: month, selectedYear: year);
  }

  void previousMonth() {
    int newMonth = state.selectedMonth - 1;
    int newYear = state.selectedYear;
    if (newMonth < 1) {
      newMonth = 12;
      newYear--;
    }
    state = state.copyWith(selectedMonth: newMonth, selectedYear: newYear);
  }

  void nextMonth() {
    int newMonth = state.selectedMonth + 1;
    int newYear = state.selectedYear;
    if (newMonth > 12) {
      newMonth = 1;
      newYear++;
    }
    state = state.copyWith(selectedMonth: newMonth, selectedYear: newYear);
  }
}

/// Provider for the attendance view state.
final attendanceViewStateProvider =
    StateNotifierProvider.autoDispose<AttendanceViewNotifier, AttendanceViewState>(
  (ref) => AttendanceViewNotifier(),
);

/// Key for fetching attendance: (siswaId, month, year).
class AttendanceFetchParams {
  const AttendanceFetchParams({
    required this.siswaId,
    required this.bulan,
    required this.tahun,
  });

  final String siswaId;
  final int bulan;
  final int tahun;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AttendanceFetchParams &&
          other.siswaId == siswaId &&
          other.bulan == bulan &&
          other.tahun == tahun;

  @override
  int get hashCode => Object.hash(siswaId, bulan, tahun);
}

/// Provider that fetches attendance data for a specific child + month.
///
/// API: GET /absensi/anak/:siswaId?bulan=&tahun=
/// Requirements: 8.1, 8.2, 8.3
final childAttendanceProvider = FutureProvider.autoDispose
    .family<ChildAttendanceResponse, AttendanceFetchParams>(
  (ref, params) async {
    final apiClient = ref.watch(apiClientProvider);

    try {
      final response = await apiClient.dio.get(
        '/absensi/anak/${params.siswaId}',
        queryParameters: {
          'bulan': params.bulan,
          'tahun': params.tahun,
        },
      );

      return ChildAttendanceResponse.fromJson(
        response.data as Map<String, dynamic>,
      );
    } catch (e) {
      _logger.e('Failed to fetch child attendance: $e');
      rethrow;
    }
  },
);
