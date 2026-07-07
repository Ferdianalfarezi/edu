import 'package:drift/drift.dart';

/// Cached schedule data for offline display.
///
/// When online, the app fetches the teacher's schedule and stores it locally
/// so guru can still see which classes they need to do attendance for
/// even when offline.
class CachedSchedules extends Table {
  /// Server UUID of the jadwal record.
  TextColumn get serverId => text()();

  /// Class UUID.
  TextColumn get kelasId => text()();

  /// Class display name (e.g., "1A").
  TextColumn get kelasNama => text()();

  /// Subject UUID.
  TextColumn get mataPelajaranId => text()();

  /// Subject name.
  TextColumn get mataPelajaranNama => text()();

  /// Day of the week: senin, selasa, rabu, kamis, jumat, sabtu.
  TextColumn get hari => text()();

  /// Lesson start time (HH:mm format).
  TextColumn get jamMulai => text()();

  /// Lesson end time (HH:mm format).
  TextColumn get jamSelesai => text()();

  /// When this cache entry was last updated from the server.
  DateTimeColumn get cachedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {serverId};
}
