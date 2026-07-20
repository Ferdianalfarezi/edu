import 'package:drift/drift.dart' show Value;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:logger/logger.dart';

import '../../../core/constants/api_constants.dart';
import '../../../core/database/app_database.dart';
import '../../../core/di/providers.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/connectivity_service.dart';
import '../../../core/providers/hari_kerja_provider.dart';
import '../models/jadwal_item.dart';
import '../models/student_attendance.dart';
import '../services/attendance_sync_service.dart';

final _logger = Logger(printer: SimplePrinter());

/// Provider for today's jadwal (classes to teach).
///
/// Fetches from API when online, falls back to cached data when offline.
final todayJadwalProvider =
    FutureProvider.autoDispose<List<JadwalItem>>((ref) async {
  final apiClient = ref.watch(apiClientProvider);
  final database = ref.watch(appDatabaseProvider);
  final connectivity = ref.watch(connectivityServiceProvider);

  final isOnline = await connectivity.checkConnectivity();

  if (isOnline) {
    try {
      final response = await apiClient.dio.get(
        ApiConstants.absensiKelasHariIni,
      );

      final data = response.data as Map<String, dynamic>;
      final items = (data['kelas'] as List<dynamic>?)
              ?.map((e) => JadwalItem.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [];

      // Cache to local database for offline use
      await _cacheSchedule(database, items);

      return items;
    } catch (e) {
      _logger.e('Failed to fetch jadwal, falling back to cache: $e');
      return _loadCachedSchedule(database);
    }
  } else {
    return _loadCachedSchedule(database);
  }
});

/// Cache schedule items to local Drift database.
Future<void> _cacheSchedule(AppDatabase db, List<JadwalItem> items) async {
  try {
    // Clear old cache and insert fresh data
    await db.delete(db.cachedSchedules).go();

    if (items.isNotEmpty) {
      await db.batch((batch) {
        batch.insertAll(
          db.cachedSchedules,
          items.map((item) {
            return CachedSchedulesCompanion.insert(
              serverId: item.id,
              kelasId: item.kelasId,
              kelasNama: item.kelasNama,
              mataPelajaranId: item.mataPelajaranId,
              mataPelajaranNama: item.mataPelajaranNama,
              hari: _todayHari(),
              jamKe: item.jamKe,
              cachedAt: DateTime.now(),
            );
          }).toList(),
        );
      });
    }
  } catch (e) {
    _logger.e('Failed to cache schedule: $e');
  }
}

/// Load schedule from local Drift cache (offline fallback).
Future<List<JadwalItem>> _loadCachedSchedule(AppDatabase db) async {
  final today = _todayHari();
  final cached = await (db.select(db.cachedSchedules)
        ..where((t) => t.hari.equals(today)))
      .get();

  return cached.map((row) {
    return JadwalItem(
      id: row.serverId,
      kelasId: row.kelasId,
      kelasNama: row.kelasNama,
      mataPelajaranId: row.mataPelajaranId,
      mataPelajaranNama: row.mataPelajaranNama,
      jamKe: row.jamKe,
    );
  }).toList();
}

/// Get today's day name in Indonesian (lowercase).
String _todayHari() {
  final now = DateTime.now();
  const days = [
    'senin',
    'selasa',
    'rabu',
    'kamis',
    'jumat',
    'sabtu',
    'minggu',
  ];
  // DateTime.weekday: 1 = Monday
  return days[now.weekday - 1];
}

/// Provider for students in a specific class.
///
/// Fetches from API when online, falls back to cached data when offline.
final classStudentsProvider = FutureProvider.autoDispose
    .family<List<StudentAttendance>, String>((ref, kelasId) async {
  final apiClient = ref.watch(apiClientProvider);
  final database = ref.watch(appDatabaseProvider);
  final connectivity = ref.watch(connectivityServiceProvider);

  final isOnline = await connectivity.checkConnectivity();

  if (isOnline) {
    try {
      final response = await apiClient.dio.get(
        '/siswa',
        queryParameters: {'kelas_id': kelasId},
      );

      final data = response.data as Map<String, dynamic>;
      final students = (data['data'] as List<dynamic>?)
              ?.map(
                  (e) => StudentAttendance.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [];

      // Cache students for offline use
      await _cacheStudents(database, kelasId, students);

      return students;
    } catch (e) {
      _logger.e('Failed to fetch students, falling back to cache: $e');
      return _loadCachedStudents(database, kelasId);
    }
  } else {
    return _loadCachedStudents(database, kelasId);
  }
});

/// Cache students to local database.
Future<void> _cacheStudents(
  AppDatabase db,
  String kelasId,
  List<StudentAttendance> students,
) async {
  try {
    // Remove old cache for this class
    await (db.delete(db.cachedStudents)
          ..where((t) => t.kelasId.equals(kelasId)))
        .go();

    if (students.isNotEmpty) {
      await db.batch((batch) {
        batch.insertAll(
          db.cachedStudents,
          students.map((s) {
            return CachedStudentsCompanion.insert(
              siswaId: s.siswaId,
              kelasId: kelasId,
              nama: s.nama,
              nisn: Value(s.nisn),
              cachedAt: DateTime.now(),
            );
          }).toList(),
        );
      });
    }
  } catch (e) {
    _logger.e('Failed to cache students: $e');
  }
}

/// Load students from local cache.
Future<List<StudentAttendance>> _loadCachedStudents(
  AppDatabase db,
  String kelasId,
) async {
  final cached = await (db.select(db.cachedStudents)
        ..where((t) => t.kelasId.equals(kelasId)))
      .get();

  return cached.map((row) {
    return StudentAttendance(
      siswaId: row.siswaId,
      nama: row.nama,
      nisn: row.nisn,
    );
  }).toList();
}

/// State for managing the attendance input form.
class AttendanceInputState {
  const AttendanceInputState({
    this.students = const [],
    this.isSubmitting = false,
    this.submitResult,
    this.error,
  });

  final List<StudentAttendance> students;
  final bool isSubmitting;
  final AttendanceSubmitResult? submitResult;
  final String? error;

  AttendanceInputState copyWith({
    List<StudentAttendance>? students,
    bool? isSubmitting,
    AttendanceSubmitResult? submitResult,
    String? error,
  }) {
    return AttendanceInputState(
      students: students ?? this.students,
      isSubmitting: isSubmitting ?? this.isSubmitting,
      submitResult: submitResult,
      error: error,
    );
  }
}

/// Result of an attendance submission.
enum AttendanceSubmitResult {
  /// Successfully posted to server.
  syncedOnline,

  /// Saved to local Drift queue (offline).
  savedOffline,
}

/// Notifier that manages attendance input state.
class AttendanceInputNotifier extends StateNotifier<AttendanceInputState> {
  AttendanceInputNotifier({
    required this.kelasId,
    required this.apiClient,
    required this.database,
    required this.connectivityService,
    required this.syncService,
    required this.hariKerja,
  }) : super(const AttendanceInputState());

  final String kelasId;
  final ApiClient apiClient;
  final AppDatabase database;
  final ConnectivityService connectivityService;
  final AttendanceSyncService syncService;
  final HariKerja hariKerja;

  /// Initialize students list.
  void setStudents(List<StudentAttendance> students) {
    state = state.copyWith(students: students);
  }

  /// Update a student's attendance status.
  void updateStatus(String siswaId, String status) {
    final updated = state.students.map((s) {
      if (s.siswaId == siswaId) {
        s.status = status;
      }
      return s;
    }).toList();
    state = state.copyWith(students: updated, error: null);
  }

  /// Update a student's keterangan (notes for izin/sakit).
  void updateKeterangan(String siswaId, String? keterangan) {
    final updated = state.students.map((s) {
      if (s.siswaId == siswaId) {
        s.keterangan = keterangan;
      }
      return s;
    }).toList();
    state = state.copyWith(students: updated);
  }

  /// Mark all students with a specific status (bulk action).
  void markAll(String status) {
    final updated = state.students.map((s) {
      s.status = status;
      return s;
    }).toList();
    state = state.copyWith(students: updated, error: null);
  }

  /// Validate and submit attendance.
  ///
  /// If online → POST to API.
  /// If offline → save to Drift with event_timestamp per ADR-003.
  Future<void> submit() async {
    // Reject Saturday submissions for 5_hari tenants (client-side guard)
    final now = DateTime.now();
    if (now.weekday == 6 && !hariKerja.includeSaturday) {
      state = state.copyWith(
        error: 'Hari Sabtu bukan hari aktif untuk sekolah ini',
      );
      return;
    }

    // Validate all students have status
    final unset = state.students.where((s) => s.status == null).toList();
    if (unset.isNotEmpty) {
      final names = unset.map((s) => s.nama).join(', ');
      state = state.copyWith(
        error: 'Belum diisi: $names',
      );
      return;
    }

    state = state.copyWith(isSubmitting: true, error: null);

    final isOnline = await connectivityService.checkConnectivity();
    final tanggal = DateTime.now().toIso8601String().substring(0, 10);

    if (isOnline) {
      try {
        await apiClient.dio.post(
          '/absensi/kelas/$kelasId',
          data: {
            'tanggal': tanggal,
            'records': state.students.map((s) {
              return {
                'siswa_id': s.siswaId,
                'status': s.status,
                if (s.keterangan != null && s.keterangan!.isNotEmpty)
                  'keterangan': s.keterangan,
              };
            }).toList(),
          },
        );

        state = state.copyWith(
          isSubmitting: false,
          submitResult: AttendanceSubmitResult.syncedOnline,
        );
      } catch (e) {
        // If API fails, save offline as fallback
        _logger.e('Online submit failed, saving offline: $e');
        await _saveOffline(tanggal);
      }
    } else {
      await _saveOffline(tanggal);
    }
  }

  /// Save attendance records to local Drift queue.
  Future<void> _saveOffline(String tanggal) async {
    try {
      await syncService.saveToLocalQueue(
        kelasId: kelasId,
        tanggal: tanggal,
        records: state.students
            .map((s) => (siswaId: s.siswaId, status: s.status!))
            .toList(),
      );

      state = state.copyWith(
        isSubmitting: false,
        submitResult: AttendanceSubmitResult.savedOffline,
      );
    } catch (e) {
      state = state.copyWith(
        isSubmitting: false,
        error: 'Gagal menyimpan data: $e',
      );
    }
  }
}

/// Provider for the attendance input notifier, scoped to a class.
final attendanceInputProvider = StateNotifierProvider.autoDispose
    .family<AttendanceInputNotifier, AttendanceInputState, String>(
        (ref, kelasId) {
  final apiClient = ref.watch(apiClientProvider);
  final database = ref.watch(appDatabaseProvider);
  final connectivity = ref.watch(connectivityServiceProvider);
  final syncService = ref.read(attendanceSyncServiceProvider.notifier);
  final hariKerjaAsync = ref.watch(hariKerjaProvider);
  final hariKerja = hariKerjaAsync.valueOrNull ?? HariKerja.enam;

  return AttendanceInputNotifier(
    kelasId: kelasId,
    apiClient: apiClient,
    database: database,
    connectivityService: connectivity,
    syncService: syncService,
    hariKerja: hariKerja,
  );
});
