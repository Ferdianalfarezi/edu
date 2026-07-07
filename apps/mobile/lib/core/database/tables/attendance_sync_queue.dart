import 'package:drift/drift.dart';

/// Sync queue for offline attendance records.
///
/// When guru submits attendance offline, records are stored here with
/// [eventTimestamp] (the time the teacher pressed save, NOT sync time).
/// Per ADR-003: conflict resolution uses event_timestamp for LWW.
class AttendanceSyncQueue extends Table {
  /// Auto-incremented local ID.
  IntColumn get id => integer().autoIncrement()();

  /// Student UUID from the server.
  TextColumn get siswaId => text()();

  /// Class UUID from the server.
  TextColumn get kelasId => text()();

  /// Attendance date (ISO 8601 date string).
  TextColumn get tanggal => text()();

  /// Attendance status: hadir, izin, sakit, alpa.
  TextColumn get status => text().withLength(min: 3, max: 10)();

  /// Timestamp when the teacher pressed save (event-time, NOT sync-time).
  /// This is the authoritative timestamp for conflict resolution per ADR-003.
  DateTimeColumn get eventTimestamp => dateTime()();

  /// Whether this record has been successfully synced to the server.
  BoolColumn get isSynced => boolean().withDefault(const Constant(false))();

  /// Timestamp of last sync attempt (null if never attempted).
  DateTimeColumn get lastSyncAttempt => dateTime().nullable()();

  /// Error message from last failed sync attempt.
  TextColumn get syncError => text().nullable()();

  /// Number of sync retry attempts.
  IntColumn get retryCount => integer().withDefault(const Constant(0))();
}
