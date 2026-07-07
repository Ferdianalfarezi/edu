import 'dart:io';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:path_provider/path_provider.dart';
import 'package:path/path.dart' as p;

import 'tables/attendance_sync_queue.dart';
import 'tables/cached_schedule.dart';
import 'tables/cached_students.dart';

part 'app_database.g.dart';

/// Local SQLite database using Drift for offline-first support.
///
/// Stores:
/// - Attendance sync queue (guru offline attendance records)
/// - Cached schedules for offline class display
/// - Cached student lists for offline attendance input
@DriftDatabase(
  tables: [
    AttendanceSyncQueue,
    CachedSchedules,
    CachedStudents,
  ],
)
class AppDatabase extends _$AppDatabase {
  AppDatabase() : super(_openConnection());

  /// For testing with in-memory database.
  AppDatabase.forTesting(super.e);

  @override
  int get schemaVersion => 1;

  @override
  MigrationStrategy get migration {
    return MigrationStrategy(
      onCreate: (Migrator m) async {
        await m.createAll();
      },
      onUpgrade: (Migrator m, int from, int to) async {
        // Handle future migrations here
      },
    );
  }
}

LazyDatabase _openConnection() {
  return LazyDatabase(() async {
    final dbFolder = await getApplicationDocumentsDirectory();
    final file = File(p.join(dbFolder.path, 'edu_mobile.sqlite'));
    return NativeDatabase.createInBackground(file);
  });
}
