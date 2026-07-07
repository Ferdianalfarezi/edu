import 'dart:async';

import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:logger/logger.dart';

import '../../../core/database/app_database.dart';
import '../../../core/di/providers.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/connectivity_service.dart';
import '../../../core/constants/api_constants.dart';
import '../models/sync_result.dart';

final _logger = Logger(printer: SimplePrinter());

/// Sync status exposed to the UI.
class SyncStatus {
  const SyncStatus({
    this.pendingCount = 0,
    this.isSyncing = false,
    this.lastSyncResult,
    this.lastError,
  });

  final int pendingCount;
  final bool isSyncing;
  final SyncResult? lastSyncResult;
  final String? lastError;

  SyncStatus copyWith({
    int? pendingCount,
    bool? isSyncing,
    SyncResult? lastSyncResult,
    String? lastError,
  }) {
    return SyncStatus(
      pendingCount: pendingCount ?? this.pendingCount,
      isSyncing: isSyncing ?? this.isSyncing,
      lastSyncResult: lastSyncResult ?? this.lastSyncResult,
      lastError: lastError,
    );
  }
}

/// Clock skew status for UI warnings.
class ClockSkewStatus {
  const ClockSkewStatus({
    this.skewSeconds = 0,
    this.hasWarning = false,
  });

  final int skewSeconds;
  final bool hasWarning;
}

/// Service that manages offline attendance sync.
///
/// Watches connectivity and auto-syncs pending items when online.
/// Detects clock skew by comparing server Date header vs local time.
/// Per ADR-003: uses event_timestamp (local save time, not sync time).
class AttendanceSyncService extends StateNotifier<SyncStatus> {
  AttendanceSyncService({
    required this.database,
    required this.apiClient,
    required this.connectivityService,
  }) : super(const SyncStatus()) {
    _init();
  }

  final AppDatabase database;
  final ApiClient apiClient;
  final ConnectivityService connectivityService;

  StreamSubscription<bool>? _connectivitySubscription;
  Timer? _periodicSyncTimer;
  bool _disposed = false;

  /// Clock skew detection state.
  ClockSkewStatus clockSkew = const ClockSkewStatus();

  /// Initialize the sync service: listen to connectivity, load pending count.
  Future<void> _init() async {
    await _refreshPendingCount();

    // Watch connectivity and auto-sync on restore
    _connectivitySubscription =
        connectivityService.onConnectivityChanged.listen((isOnline) {
      if (isOnline && !_disposed) {
        syncPendingRecords();
      }
    });

    // Periodic sync attempt every 30 seconds when online
    _periodicSyncTimer = Timer.periodic(
      const Duration(seconds: 30),
      (_) {
        if (connectivityService.isOnline && state.pendingCount > 0) {
          syncPendingRecords();
        }
      },
    );
  }

  /// Refresh the pending count from the local database.
  Future<void> _refreshPendingCount() async {
    final count = await (database.select(database.attendanceSyncQueue)
          ..where((t) => t.isSynced.equals(false)))
        .get();
    if (!_disposed) {
      state = state.copyWith(pendingCount: count.length);
    }
  }

  /// Save attendance to local Drift queue with event_timestamp = DateTime.now().
  ///
  /// Per ADR-003: event_timestamp is the time the teacher pressed save,
  /// NOT the time data syncs to server.
  Future<void> saveToLocalQueue({
    required String kelasId,
    required String tanggal,
    required List<({String siswaId, String status})> records,
  }) async {
    final eventTimestamp = DateTime.now();

    final companions = records.map((r) {
      return AttendanceSyncQueueCompanion.insert(
        siswaId: r.siswaId,
        kelasId: kelasId,
        tanggal: tanggal,
        status: r.status,
        eventTimestamp: eventTimestamp,
      );
    }).toList();

    await database.batch((batch) {
      batch.insertAll(database.attendanceSyncQueue, companions);
    });

    await _refreshPendingCount();
  }

  /// Attempt to sync all pending records to the server.
  ///
  /// Called automatically on connectivity restore or manually by pull-to-refresh.
  Future<SyncResult?> syncPendingRecords() async {
    if (state.isSyncing || _disposed) return null;
    if (!connectivityService.isOnline) return null;

    final pending = await (database.select(database.attendanceSyncQueue)
          ..where((t) => t.isSynced.equals(false)))
        .get();

    if (pending.isEmpty) {
      state = state.copyWith(pendingCount: 0, isSyncing: false);
      return null;
    }

    state = state.copyWith(isSyncing: true, lastError: null);

    try {
      final requestBody = {
        'records': pending.map((r) {
          return {
            'siswa_id': r.siswaId,
            'kelas_id': r.kelasId,
            'tanggal': r.tanggal,
            'status': r.status,
            'event_timestamp': r.eventTimestamp.toUtc().toIso8601String(),
          };
        }).toList(),
      };

      final response = await apiClient.dio.post(
        ApiConstants.absensiSync,
        data: requestBody,
      );

      // Detect clock skew from server Date header
      _detectClockSkew(response.headers);

      final result = SyncResult.fromJson(
        response.data as Map<String, dynamic>,
      );

      // Mark synced records
      for (final syncedId in result.synced) {
        await (database.update(database.attendanceSyncQueue)
              ..where((t) => t.siswaId.equals(syncedId)))
            .write(
          const AttendanceSyncQueueCompanion(
            isSynced: Value(true),
          ),
        );
      }

      // Mark conflict-resolved records as synced too (they've been processed)
      for (final conflict in result.conflicts) {
        await (database.update(database.attendanceSyncQueue)
              ..where((t) =>
                  t.siswaId.equals(conflict.siswaId) &
                  t.tanggal.equals(conflict.tanggal)))
            .write(
          const AttendanceSyncQueueCompanion(
            isSynced: Value(true),
          ),
        );
      }

      await _refreshPendingCount();
      state = state.copyWith(
        isSyncing: false,
        lastSyncResult: result,
        lastError: null,
      );

      return result;
    } catch (e) {
      _logger.e('Sync failed: $e');
      state = state.copyWith(
        isSyncing: false,
        lastError: 'Sinkronisasi gagal. Akan dicoba kembali.',
      );

      // Increment retry count for pending records
      for (final record in pending) {
        await (database.update(database.attendanceSyncQueue)
              ..where((t) => t.id.equals(record.id)))
            .write(
          AttendanceSyncQueueCompanion(
            retryCount: Value(record.retryCount + 1),
            lastSyncAttempt: Value(DateTime.now()),
            syncError: Value(e.toString()),
          ),
        );
      }

      return null;
    }
  }

  /// Detect clock skew from server response Date header.
  ///
  /// Warns if device clock differs from server by >5 minutes.
  void _detectClockSkew(dynamic headers) {
    try {
      final dateHeader = headers.value('date') as String?;
      if (dateHeader == null) return;

      final serverTime = HttpDate.parse(dateHeader);
      final localTime = DateTime.now().toUtc();
      final diff = localTime.difference(serverTime).inSeconds.abs();

      clockSkew = ClockSkewStatus(
        skewSeconds: diff,
        hasWarning: diff > 300, // > 5 minutes
      );
    } catch (_) {
      // Ignore parse errors — non-critical
    }
  }

  /// Check clock skew against server time.
  /// Returns the skew in seconds or null if check fails.
  Future<int?> checkClockSkew() async {
    if (!connectivityService.isOnline) return null;

    try {
      // Use any lightweight endpoint to get server Date header
      final response = await apiClient.dio.head(
        ApiConstants.absensiKelasHariIni,
      );
      _detectClockSkew(response.headers);
      return clockSkew.skewSeconds;
    } catch (_) {
      return null;
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _connectivitySubscription?.cancel();
    _periodicSyncTimer?.cancel();
    super.dispose();
  }
}

/// Dart's HttpDate parser for RFC 1123 date format.
class HttpDate {
  static DateTime parse(String date) {
    // Server Date header format: "Mon, 01 Jan 2024 07:00:00 GMT"
    return DateTime.parse(
      _convertHttpDate(date),
    );
  }

  static String _convertHttpDate(String httpDate) {
    // Try standard DateTime.parse first with RFC 1123 conversion
    final months = {
      'Jan': '01',
      'Feb': '02',
      'Mar': '03',
      'Apr': '04',
      'May': '05',
      'Jun': '06',
      'Jul': '07',
      'Aug': '08',
      'Sep': '09',
      'Oct': '10',
      'Nov': '11',
      'Dec': '12',
    };

    try {
      // "Mon, 01 Jan 2024 07:00:00 GMT"
      final parts = httpDate.split(' ');
      if (parts.length >= 5) {
        final day = parts[1];
        final month = months[parts[2]] ?? '01';
        final year = parts[3];
        final time = parts[4];
        return '$year-$month-${day}T${time}Z';
      }
    } catch (_) {}

    // Fallback: return current time
    return DateTime.now().toUtc().toIso8601String();
  }
}

/// Provider for the sync service.
final attendanceSyncServiceProvider =
    StateNotifierProvider<AttendanceSyncService, SyncStatus>((ref) {
  final database = ref.watch(appDatabaseProvider);
  final apiClient = ref.watch(apiClientProvider);
  final connectivity = ref.watch(connectivityServiceProvider);

  return AttendanceSyncService(
    database: database,
    apiClient: apiClient,
    connectivityService: connectivity,
  );
});
