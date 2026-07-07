import 'package:drift/drift.dart';

/// Cached student list per class for offline attendance input.
///
/// When online, the app caches students for each class so the teacher
/// can still input attendance while offline.
class CachedStudents extends Table {
  /// Server UUID of the student.
  TextColumn get siswaId => text()();

  /// Class UUID this student belongs to.
  TextColumn get kelasId => text()();

  /// Student display name.
  TextColumn get nama => text()();

  /// Student NISN (optional).
  TextColumn get nisn => text().nullable()();

  /// When this cache entry was last updated.
  DateTimeColumn get cachedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {siswaId};
}
