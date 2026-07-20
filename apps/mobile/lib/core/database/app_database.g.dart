// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'app_database.dart';

// ignore_for_file: type=lint
class $AttendanceSyncQueueTable extends AttendanceSyncQueue
    with TableInfo<$AttendanceSyncQueueTable, AttendanceSyncQueueData> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $AttendanceSyncQueueTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<int> id = GeneratedColumn<int>(
      'id', aliasedName, false,
      hasAutoIncrement: true,
      type: DriftSqlType.int,
      requiredDuringInsert: false,
      defaultConstraints:
          GeneratedColumn.constraintIsAlways('PRIMARY KEY AUTOINCREMENT'));
  static const VerificationMeta _siswaIdMeta =
      const VerificationMeta('siswaId');
  @override
  late final GeneratedColumn<String> siswaId = GeneratedColumn<String>(
      'siswa_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _kelasIdMeta =
      const VerificationMeta('kelasId');
  @override
  late final GeneratedColumn<String> kelasId = GeneratedColumn<String>(
      'kelas_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _tanggalMeta =
      const VerificationMeta('tanggal');
  @override
  late final GeneratedColumn<String> tanggal = GeneratedColumn<String>(
      'tanggal', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _statusMeta = const VerificationMeta('status');
  @override
  late final GeneratedColumn<String> status = GeneratedColumn<String>(
      'status', aliasedName, false,
      additionalChecks:
          GeneratedColumn.checkTextLength(minTextLength: 3, maxTextLength: 10),
      type: DriftSqlType.string,
      requiredDuringInsert: true);
  static const VerificationMeta _eventTimestampMeta =
      const VerificationMeta('eventTimestamp');
  @override
  late final GeneratedColumn<DateTime> eventTimestamp =
      GeneratedColumn<DateTime>('event_timestamp', aliasedName, false,
          type: DriftSqlType.dateTime, requiredDuringInsert: true);
  static const VerificationMeta _isSyncedMeta =
      const VerificationMeta('isSynced');
  @override
  late final GeneratedColumn<bool> isSynced = GeneratedColumn<bool>(
      'is_synced', aliasedName, false,
      type: DriftSqlType.bool,
      requiredDuringInsert: false,
      defaultConstraints:
          GeneratedColumn.constraintIsAlways('CHECK ("is_synced" IN (0, 1))'),
      defaultValue: const Constant(false));
  static const VerificationMeta _lastSyncAttemptMeta =
      const VerificationMeta('lastSyncAttempt');
  @override
  late final GeneratedColumn<DateTime> lastSyncAttempt =
      GeneratedColumn<DateTime>('last_sync_attempt', aliasedName, true,
          type: DriftSqlType.dateTime, requiredDuringInsert: false);
  static const VerificationMeta _syncErrorMeta =
      const VerificationMeta('syncError');
  @override
  late final GeneratedColumn<String> syncError = GeneratedColumn<String>(
      'sync_error', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _retryCountMeta =
      const VerificationMeta('retryCount');
  @override
  late final GeneratedColumn<int> retryCount = GeneratedColumn<int>(
      'retry_count', aliasedName, false,
      type: DriftSqlType.int,
      requiredDuringInsert: false,
      defaultValue: const Constant(0));
  @override
  List<GeneratedColumn> get $columns => [
        id,
        siswaId,
        kelasId,
        tanggal,
        status,
        eventTimestamp,
        isSynced,
        lastSyncAttempt,
        syncError,
        retryCount
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'attendance_sync_queue';
  @override
  VerificationContext validateIntegrity(
      Insertable<AttendanceSyncQueueData> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    }
    if (data.containsKey('siswa_id')) {
      context.handle(_siswaIdMeta,
          siswaId.isAcceptableOrUnknown(data['siswa_id']!, _siswaIdMeta));
    } else if (isInserting) {
      context.missing(_siswaIdMeta);
    }
    if (data.containsKey('kelas_id')) {
      context.handle(_kelasIdMeta,
          kelasId.isAcceptableOrUnknown(data['kelas_id']!, _kelasIdMeta));
    } else if (isInserting) {
      context.missing(_kelasIdMeta);
    }
    if (data.containsKey('tanggal')) {
      context.handle(_tanggalMeta,
          tanggal.isAcceptableOrUnknown(data['tanggal']!, _tanggalMeta));
    } else if (isInserting) {
      context.missing(_tanggalMeta);
    }
    if (data.containsKey('status')) {
      context.handle(_statusMeta,
          status.isAcceptableOrUnknown(data['status']!, _statusMeta));
    } else if (isInserting) {
      context.missing(_statusMeta);
    }
    if (data.containsKey('event_timestamp')) {
      context.handle(
          _eventTimestampMeta,
          eventTimestamp.isAcceptableOrUnknown(
              data['event_timestamp']!, _eventTimestampMeta));
    } else if (isInserting) {
      context.missing(_eventTimestampMeta);
    }
    if (data.containsKey('is_synced')) {
      context.handle(_isSyncedMeta,
          isSynced.isAcceptableOrUnknown(data['is_synced']!, _isSyncedMeta));
    }
    if (data.containsKey('last_sync_attempt')) {
      context.handle(
          _lastSyncAttemptMeta,
          lastSyncAttempt.isAcceptableOrUnknown(
              data['last_sync_attempt']!, _lastSyncAttemptMeta));
    }
    if (data.containsKey('sync_error')) {
      context.handle(_syncErrorMeta,
          syncError.isAcceptableOrUnknown(data['sync_error']!, _syncErrorMeta));
    }
    if (data.containsKey('retry_count')) {
      context.handle(
          _retryCountMeta,
          retryCount.isAcceptableOrUnknown(
              data['retry_count']!, _retryCountMeta));
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  AttendanceSyncQueueData map(Map<String, dynamic> data,
      {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return AttendanceSyncQueueData(
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}id'])!,
      siswaId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}siswa_id'])!,
      kelasId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}kelas_id'])!,
      tanggal: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}tanggal'])!,
      status: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}status'])!,
      eventTimestamp: attachedDatabase.typeMapping.read(
          DriftSqlType.dateTime, data['${effectivePrefix}event_timestamp'])!,
      isSynced: attachedDatabase.typeMapping
          .read(DriftSqlType.bool, data['${effectivePrefix}is_synced'])!,
      lastSyncAttempt: attachedDatabase.typeMapping.read(
          DriftSqlType.dateTime, data['${effectivePrefix}last_sync_attempt']),
      syncError: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}sync_error']),
      retryCount: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}retry_count'])!,
    );
  }

  @override
  $AttendanceSyncQueueTable createAlias(String alias) {
    return $AttendanceSyncQueueTable(attachedDatabase, alias);
  }
}

class AttendanceSyncQueueData extends DataClass
    implements Insertable<AttendanceSyncQueueData> {
  /// Auto-incremented local ID.
  final int id;

  /// Student UUID from the server.
  final String siswaId;

  /// Class UUID from the server.
  final String kelasId;

  /// Attendance date (ISO 8601 date string).
  final String tanggal;

  /// Attendance status: hadir, izin, sakit, alpa.
  final String status;

  /// Timestamp when the teacher pressed save (event-time, NOT sync-time).
  /// This is the authoritative timestamp for conflict resolution per ADR-003.
  final DateTime eventTimestamp;

  /// Whether this record has been successfully synced to the server.
  final bool isSynced;

  /// Timestamp of last sync attempt (null if never attempted).
  final DateTime? lastSyncAttempt;

  /// Error message from last failed sync attempt.
  final String? syncError;

  /// Number of sync retry attempts.
  final int retryCount;
  const AttendanceSyncQueueData(
      {required this.id,
      required this.siswaId,
      required this.kelasId,
      required this.tanggal,
      required this.status,
      required this.eventTimestamp,
      required this.isSynced,
      this.lastSyncAttempt,
      this.syncError,
      required this.retryCount});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<int>(id);
    map['siswa_id'] = Variable<String>(siswaId);
    map['kelas_id'] = Variable<String>(kelasId);
    map['tanggal'] = Variable<String>(tanggal);
    map['status'] = Variable<String>(status);
    map['event_timestamp'] = Variable<DateTime>(eventTimestamp);
    map['is_synced'] = Variable<bool>(isSynced);
    if (!nullToAbsent || lastSyncAttempt != null) {
      map['last_sync_attempt'] = Variable<DateTime>(lastSyncAttempt);
    }
    if (!nullToAbsent || syncError != null) {
      map['sync_error'] = Variable<String>(syncError);
    }
    map['retry_count'] = Variable<int>(retryCount);
    return map;
  }

  AttendanceSyncQueueCompanion toCompanion(bool nullToAbsent) {
    return AttendanceSyncQueueCompanion(
      id: Value(id),
      siswaId: Value(siswaId),
      kelasId: Value(kelasId),
      tanggal: Value(tanggal),
      status: Value(status),
      eventTimestamp: Value(eventTimestamp),
      isSynced: Value(isSynced),
      lastSyncAttempt: lastSyncAttempt == null && nullToAbsent
          ? const Value.absent()
          : Value(lastSyncAttempt),
      syncError: syncError == null && nullToAbsent
          ? const Value.absent()
          : Value(syncError),
      retryCount: Value(retryCount),
    );
  }

  factory AttendanceSyncQueueData.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return AttendanceSyncQueueData(
      id: serializer.fromJson<int>(json['id']),
      siswaId: serializer.fromJson<String>(json['siswaId']),
      kelasId: serializer.fromJson<String>(json['kelasId']),
      tanggal: serializer.fromJson<String>(json['tanggal']),
      status: serializer.fromJson<String>(json['status']),
      eventTimestamp: serializer.fromJson<DateTime>(json['eventTimestamp']),
      isSynced: serializer.fromJson<bool>(json['isSynced']),
      lastSyncAttempt: serializer.fromJson<DateTime?>(json['lastSyncAttempt']),
      syncError: serializer.fromJson<String?>(json['syncError']),
      retryCount: serializer.fromJson<int>(json['retryCount']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<int>(id),
      'siswaId': serializer.toJson<String>(siswaId),
      'kelasId': serializer.toJson<String>(kelasId),
      'tanggal': serializer.toJson<String>(tanggal),
      'status': serializer.toJson<String>(status),
      'eventTimestamp': serializer.toJson<DateTime>(eventTimestamp),
      'isSynced': serializer.toJson<bool>(isSynced),
      'lastSyncAttempt': serializer.toJson<DateTime?>(lastSyncAttempt),
      'syncError': serializer.toJson<String?>(syncError),
      'retryCount': serializer.toJson<int>(retryCount),
    };
  }

  AttendanceSyncQueueData copyWith(
          {int? id,
          String? siswaId,
          String? kelasId,
          String? tanggal,
          String? status,
          DateTime? eventTimestamp,
          bool? isSynced,
          Value<DateTime?> lastSyncAttempt = const Value.absent(),
          Value<String?> syncError = const Value.absent(),
          int? retryCount}) =>
      AttendanceSyncQueueData(
        id: id ?? this.id,
        siswaId: siswaId ?? this.siswaId,
        kelasId: kelasId ?? this.kelasId,
        tanggal: tanggal ?? this.tanggal,
        status: status ?? this.status,
        eventTimestamp: eventTimestamp ?? this.eventTimestamp,
        isSynced: isSynced ?? this.isSynced,
        lastSyncAttempt: lastSyncAttempt.present
            ? lastSyncAttempt.value
            : this.lastSyncAttempt,
        syncError: syncError.present ? syncError.value : this.syncError,
        retryCount: retryCount ?? this.retryCount,
      );
  AttendanceSyncQueueData copyWithCompanion(AttendanceSyncQueueCompanion data) {
    return AttendanceSyncQueueData(
      id: data.id.present ? data.id.value : this.id,
      siswaId: data.siswaId.present ? data.siswaId.value : this.siswaId,
      kelasId: data.kelasId.present ? data.kelasId.value : this.kelasId,
      tanggal: data.tanggal.present ? data.tanggal.value : this.tanggal,
      status: data.status.present ? data.status.value : this.status,
      eventTimestamp: data.eventTimestamp.present
          ? data.eventTimestamp.value
          : this.eventTimestamp,
      isSynced: data.isSynced.present ? data.isSynced.value : this.isSynced,
      lastSyncAttempt: data.lastSyncAttempt.present
          ? data.lastSyncAttempt.value
          : this.lastSyncAttempt,
      syncError: data.syncError.present ? data.syncError.value : this.syncError,
      retryCount:
          data.retryCount.present ? data.retryCount.value : this.retryCount,
    );
  }

  @override
  String toString() {
    return (StringBuffer('AttendanceSyncQueueData(')
          ..write('id: $id, ')
          ..write('siswaId: $siswaId, ')
          ..write('kelasId: $kelasId, ')
          ..write('tanggal: $tanggal, ')
          ..write('status: $status, ')
          ..write('eventTimestamp: $eventTimestamp, ')
          ..write('isSynced: $isSynced, ')
          ..write('lastSyncAttempt: $lastSyncAttempt, ')
          ..write('syncError: $syncError, ')
          ..write('retryCount: $retryCount')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, siswaId, kelasId, tanggal, status,
      eventTimestamp, isSynced, lastSyncAttempt, syncError, retryCount);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is AttendanceSyncQueueData &&
          other.id == this.id &&
          other.siswaId == this.siswaId &&
          other.kelasId == this.kelasId &&
          other.tanggal == this.tanggal &&
          other.status == this.status &&
          other.eventTimestamp == this.eventTimestamp &&
          other.isSynced == this.isSynced &&
          other.lastSyncAttempt == this.lastSyncAttempt &&
          other.syncError == this.syncError &&
          other.retryCount == this.retryCount);
}

class AttendanceSyncQueueCompanion
    extends UpdateCompanion<AttendanceSyncQueueData> {
  final Value<int> id;
  final Value<String> siswaId;
  final Value<String> kelasId;
  final Value<String> tanggal;
  final Value<String> status;
  final Value<DateTime> eventTimestamp;
  final Value<bool> isSynced;
  final Value<DateTime?> lastSyncAttempt;
  final Value<String?> syncError;
  final Value<int> retryCount;
  const AttendanceSyncQueueCompanion({
    this.id = const Value.absent(),
    this.siswaId = const Value.absent(),
    this.kelasId = const Value.absent(),
    this.tanggal = const Value.absent(),
    this.status = const Value.absent(),
    this.eventTimestamp = const Value.absent(),
    this.isSynced = const Value.absent(),
    this.lastSyncAttempt = const Value.absent(),
    this.syncError = const Value.absent(),
    this.retryCount = const Value.absent(),
  });
  AttendanceSyncQueueCompanion.insert({
    this.id = const Value.absent(),
    required String siswaId,
    required String kelasId,
    required String tanggal,
    required String status,
    required DateTime eventTimestamp,
    this.isSynced = const Value.absent(),
    this.lastSyncAttempt = const Value.absent(),
    this.syncError = const Value.absent(),
    this.retryCount = const Value.absent(),
  })  : siswaId = Value(siswaId),
        kelasId = Value(kelasId),
        tanggal = Value(tanggal),
        status = Value(status),
        eventTimestamp = Value(eventTimestamp);
  static Insertable<AttendanceSyncQueueData> custom({
    Expression<int>? id,
    Expression<String>? siswaId,
    Expression<String>? kelasId,
    Expression<String>? tanggal,
    Expression<String>? status,
    Expression<DateTime>? eventTimestamp,
    Expression<bool>? isSynced,
    Expression<DateTime>? lastSyncAttempt,
    Expression<String>? syncError,
    Expression<int>? retryCount,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (siswaId != null) 'siswa_id': siswaId,
      if (kelasId != null) 'kelas_id': kelasId,
      if (tanggal != null) 'tanggal': tanggal,
      if (status != null) 'status': status,
      if (eventTimestamp != null) 'event_timestamp': eventTimestamp,
      if (isSynced != null) 'is_synced': isSynced,
      if (lastSyncAttempt != null) 'last_sync_attempt': lastSyncAttempt,
      if (syncError != null) 'sync_error': syncError,
      if (retryCount != null) 'retry_count': retryCount,
    });
  }

  AttendanceSyncQueueCompanion copyWith(
      {Value<int>? id,
      Value<String>? siswaId,
      Value<String>? kelasId,
      Value<String>? tanggal,
      Value<String>? status,
      Value<DateTime>? eventTimestamp,
      Value<bool>? isSynced,
      Value<DateTime?>? lastSyncAttempt,
      Value<String?>? syncError,
      Value<int>? retryCount}) {
    return AttendanceSyncQueueCompanion(
      id: id ?? this.id,
      siswaId: siswaId ?? this.siswaId,
      kelasId: kelasId ?? this.kelasId,
      tanggal: tanggal ?? this.tanggal,
      status: status ?? this.status,
      eventTimestamp: eventTimestamp ?? this.eventTimestamp,
      isSynced: isSynced ?? this.isSynced,
      lastSyncAttempt: lastSyncAttempt ?? this.lastSyncAttempt,
      syncError: syncError ?? this.syncError,
      retryCount: retryCount ?? this.retryCount,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<int>(id.value);
    }
    if (siswaId.present) {
      map['siswa_id'] = Variable<String>(siswaId.value);
    }
    if (kelasId.present) {
      map['kelas_id'] = Variable<String>(kelasId.value);
    }
    if (tanggal.present) {
      map['tanggal'] = Variable<String>(tanggal.value);
    }
    if (status.present) {
      map['status'] = Variable<String>(status.value);
    }
    if (eventTimestamp.present) {
      map['event_timestamp'] = Variable<DateTime>(eventTimestamp.value);
    }
    if (isSynced.present) {
      map['is_synced'] = Variable<bool>(isSynced.value);
    }
    if (lastSyncAttempt.present) {
      map['last_sync_attempt'] = Variable<DateTime>(lastSyncAttempt.value);
    }
    if (syncError.present) {
      map['sync_error'] = Variable<String>(syncError.value);
    }
    if (retryCount.present) {
      map['retry_count'] = Variable<int>(retryCount.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('AttendanceSyncQueueCompanion(')
          ..write('id: $id, ')
          ..write('siswaId: $siswaId, ')
          ..write('kelasId: $kelasId, ')
          ..write('tanggal: $tanggal, ')
          ..write('status: $status, ')
          ..write('eventTimestamp: $eventTimestamp, ')
          ..write('isSynced: $isSynced, ')
          ..write('lastSyncAttempt: $lastSyncAttempt, ')
          ..write('syncError: $syncError, ')
          ..write('retryCount: $retryCount')
          ..write(')'))
        .toString();
  }
}

class $CachedSchedulesTable extends CachedSchedules
    with TableInfo<$CachedSchedulesTable, CachedSchedule> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $CachedSchedulesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _serverIdMeta =
      const VerificationMeta('serverId');
  @override
  late final GeneratedColumn<String> serverId = GeneratedColumn<String>(
      'server_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _kelasIdMeta =
      const VerificationMeta('kelasId');
  @override
  late final GeneratedColumn<String> kelasId = GeneratedColumn<String>(
      'kelas_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _kelasNamaMeta =
      const VerificationMeta('kelasNama');
  @override
  late final GeneratedColumn<String> kelasNama = GeneratedColumn<String>(
      'kelas_nama', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _mataPelajaranIdMeta =
      const VerificationMeta('mataPelajaranId');
  @override
  late final GeneratedColumn<String> mataPelajaranId = GeneratedColumn<String>(
      'mata_pelajaran_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _mataPelajaranNamaMeta =
      const VerificationMeta('mataPelajaranNama');
  @override
  late final GeneratedColumn<String> mataPelajaranNama =
      GeneratedColumn<String>('mata_pelajaran_nama', aliasedName, false,
          type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _hariMeta = const VerificationMeta('hari');
  @override
  late final GeneratedColumn<String> hari = GeneratedColumn<String>(
      'hari', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _jamKeMeta = const VerificationMeta('jamKe');
  @override
  late final GeneratedColumn<int> jamKe = GeneratedColumn<int>(
      'jam_ke', aliasedName, false,
      type: DriftSqlType.int, requiredDuringInsert: true);
  static const VerificationMeta _cachedAtMeta =
      const VerificationMeta('cachedAt');
  @override
  late final GeneratedColumn<DateTime> cachedAt = GeneratedColumn<DateTime>(
      'cached_at', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  @override
  List<GeneratedColumn> get $columns => [
        serverId,
        kelasId,
        kelasNama,
        mataPelajaranId,
        mataPelajaranNama,
        hari,
        jamKe,
        cachedAt
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'cached_schedules';
  @override
  VerificationContext validateIntegrity(Insertable<CachedSchedule> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('server_id')) {
      context.handle(_serverIdMeta,
          serverId.isAcceptableOrUnknown(data['server_id']!, _serverIdMeta));
    } else if (isInserting) {
      context.missing(_serverIdMeta);
    }
    if (data.containsKey('kelas_id')) {
      context.handle(_kelasIdMeta,
          kelasId.isAcceptableOrUnknown(data['kelas_id']!, _kelasIdMeta));
    } else if (isInserting) {
      context.missing(_kelasIdMeta);
    }
    if (data.containsKey('kelas_nama')) {
      context.handle(_kelasNamaMeta,
          kelasNama.isAcceptableOrUnknown(data['kelas_nama']!, _kelasNamaMeta));
    } else if (isInserting) {
      context.missing(_kelasNamaMeta);
    }
    if (data.containsKey('mata_pelajaran_id')) {
      context.handle(
          _mataPelajaranIdMeta,
          mataPelajaranId.isAcceptableOrUnknown(
              data['mata_pelajaran_id']!, _mataPelajaranIdMeta));
    } else if (isInserting) {
      context.missing(_mataPelajaranIdMeta);
    }
    if (data.containsKey('mata_pelajaran_nama')) {
      context.handle(
          _mataPelajaranNamaMeta,
          mataPelajaranNama.isAcceptableOrUnknown(
              data['mata_pelajaran_nama']!, _mataPelajaranNamaMeta));
    } else if (isInserting) {
      context.missing(_mataPelajaranNamaMeta);
    }
    if (data.containsKey('hari')) {
      context.handle(
          _hariMeta, hari.isAcceptableOrUnknown(data['hari']!, _hariMeta));
    } else if (isInserting) {
      context.missing(_hariMeta);
    }
    if (data.containsKey('jam_ke')) {
      context.handle(
          _jamKeMeta, jamKe.isAcceptableOrUnknown(data['jam_ke']!, _jamKeMeta));
    } else if (isInserting) {
      context.missing(_jamKeMeta);
    }
    if (data.containsKey('cached_at')) {
      context.handle(_cachedAtMeta,
          cachedAt.isAcceptableOrUnknown(data['cached_at']!, _cachedAtMeta));
    } else if (isInserting) {
      context.missing(_cachedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {serverId};
  @override
  CachedSchedule map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return CachedSchedule(
      serverId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}server_id'])!,
      kelasId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}kelas_id'])!,
      kelasNama: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}kelas_nama'])!,
      mataPelajaranId: attachedDatabase.typeMapping.read(
          DriftSqlType.string, data['${effectivePrefix}mata_pelajaran_id'])!,
      mataPelajaranNama: attachedDatabase.typeMapping.read(
          DriftSqlType.string, data['${effectivePrefix}mata_pelajaran_nama'])!,
      hari: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}hari'])!,
      jamKe: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}jam_ke'])!,
      cachedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}cached_at'])!,
    );
  }

  @override
  $CachedSchedulesTable createAlias(String alias) {
    return $CachedSchedulesTable(attachedDatabase, alias);
  }
}

class CachedSchedule extends DataClass implements Insertable<CachedSchedule> {
  /// Server UUID of the jadwal record.
  final String serverId;

  /// Class UUID.
  final String kelasId;

  /// Class display name (e.g., "1A").
  final String kelasNama;

  /// Subject UUID.
  final String mataPelajaranId;

  /// Subject name.
  final String mataPelajaranNama;

  /// Day of the week: senin, selasa, rabu, kamis, jumat, sabtu.
  final String hari;

  /// Lesson slot number (1-10).
  final int jamKe;

  /// When this cache entry was last updated from the server.
  final DateTime cachedAt;
  const CachedSchedule(
      {required this.serverId,
      required this.kelasId,
      required this.kelasNama,
      required this.mataPelajaranId,
      required this.mataPelajaranNama,
      required this.hari,
      required this.jamKe,
      required this.cachedAt});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['server_id'] = Variable<String>(serverId);
    map['kelas_id'] = Variable<String>(kelasId);
    map['kelas_nama'] = Variable<String>(kelasNama);
    map['mata_pelajaran_id'] = Variable<String>(mataPelajaranId);
    map['mata_pelajaran_nama'] = Variable<String>(mataPelajaranNama);
    map['hari'] = Variable<String>(hari);
    map['jam_ke'] = Variable<int>(jamKe);
    map['cached_at'] = Variable<DateTime>(cachedAt);
    return map;
  }

  CachedSchedulesCompanion toCompanion(bool nullToAbsent) {
    return CachedSchedulesCompanion(
      serverId: Value(serverId),
      kelasId: Value(kelasId),
      kelasNama: Value(kelasNama),
      mataPelajaranId: Value(mataPelajaranId),
      mataPelajaranNama: Value(mataPelajaranNama),
      hari: Value(hari),
      jamKe: Value(jamKe),
      cachedAt: Value(cachedAt),
    );
  }

  factory CachedSchedule.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return CachedSchedule(
      serverId: serializer.fromJson<String>(json['serverId']),
      kelasId: serializer.fromJson<String>(json['kelasId']),
      kelasNama: serializer.fromJson<String>(json['kelasNama']),
      mataPelajaranId: serializer.fromJson<String>(json['mataPelajaranId']),
      mataPelajaranNama: serializer.fromJson<String>(json['mataPelajaranNama']),
      hari: serializer.fromJson<String>(json['hari']),
      jamKe: serializer.fromJson<int>(json['jamKe']),
      cachedAt: serializer.fromJson<DateTime>(json['cachedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'serverId': serializer.toJson<String>(serverId),
      'kelasId': serializer.toJson<String>(kelasId),
      'kelasNama': serializer.toJson<String>(kelasNama),
      'mataPelajaranId': serializer.toJson<String>(mataPelajaranId),
      'mataPelajaranNama': serializer.toJson<String>(mataPelajaranNama),
      'hari': serializer.toJson<String>(hari),
      'jamKe': serializer.toJson<int>(jamKe),
      'cachedAt': serializer.toJson<DateTime>(cachedAt),
    };
  }

  CachedSchedule copyWith(
          {String? serverId,
          String? kelasId,
          String? kelasNama,
          String? mataPelajaranId,
          String? mataPelajaranNama,
          String? hari,
          int? jamKe,
          DateTime? cachedAt}) =>
      CachedSchedule(
        serverId: serverId ?? this.serverId,
        kelasId: kelasId ?? this.kelasId,
        kelasNama: kelasNama ?? this.kelasNama,
        mataPelajaranId: mataPelajaranId ?? this.mataPelajaranId,
        mataPelajaranNama: mataPelajaranNama ?? this.mataPelajaranNama,
        hari: hari ?? this.hari,
        jamKe: jamKe ?? this.jamKe,
        cachedAt: cachedAt ?? this.cachedAt,
      );
  CachedSchedule copyWithCompanion(CachedSchedulesCompanion data) {
    return CachedSchedule(
      serverId: data.serverId.present ? data.serverId.value : this.serverId,
      kelasId: data.kelasId.present ? data.kelasId.value : this.kelasId,
      kelasNama: data.kelasNama.present ? data.kelasNama.value : this.kelasNama,
      mataPelajaranId: data.mataPelajaranId.present
          ? data.mataPelajaranId.value
          : this.mataPelajaranId,
      mataPelajaranNama: data.mataPelajaranNama.present
          ? data.mataPelajaranNama.value
          : this.mataPelajaranNama,
      hari: data.hari.present ? data.hari.value : this.hari,
      jamKe: data.jamKe.present ? data.jamKe.value : this.jamKe,
      cachedAt: data.cachedAt.present ? data.cachedAt.value : this.cachedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('CachedSchedule(')
          ..write('serverId: $serverId, ')
          ..write('kelasId: $kelasId, ')
          ..write('kelasNama: $kelasNama, ')
          ..write('mataPelajaranId: $mataPelajaranId, ')
          ..write('mataPelajaranNama: $mataPelajaranNama, ')
          ..write('hari: $hari, ')
          ..write('jamKe: $jamKe, ')
          ..write('cachedAt: $cachedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(serverId, kelasId, kelasNama, mataPelajaranId,
      mataPelajaranNama, hari, jamKe, cachedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is CachedSchedule &&
          other.serverId == this.serverId &&
          other.kelasId == this.kelasId &&
          other.kelasNama == this.kelasNama &&
          other.mataPelajaranId == this.mataPelajaranId &&
          other.mataPelajaranNama == this.mataPelajaranNama &&
          other.hari == this.hari &&
          other.jamKe == this.jamKe &&
          other.cachedAt == this.cachedAt);
}

class CachedSchedulesCompanion extends UpdateCompanion<CachedSchedule> {
  final Value<String> serverId;
  final Value<String> kelasId;
  final Value<String> kelasNama;
  final Value<String> mataPelajaranId;
  final Value<String> mataPelajaranNama;
  final Value<String> hari;
  final Value<int> jamKe;
  final Value<DateTime> cachedAt;
  final Value<int> rowid;
  const CachedSchedulesCompanion({
    this.serverId = const Value.absent(),
    this.kelasId = const Value.absent(),
    this.kelasNama = const Value.absent(),
    this.mataPelajaranId = const Value.absent(),
    this.mataPelajaranNama = const Value.absent(),
    this.hari = const Value.absent(),
    this.jamKe = const Value.absent(),
    this.cachedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  CachedSchedulesCompanion.insert({
    required String serverId,
    required String kelasId,
    required String kelasNama,
    required String mataPelajaranId,
    required String mataPelajaranNama,
    required String hari,
    required int jamKe,
    required DateTime cachedAt,
    this.rowid = const Value.absent(),
  })  : serverId = Value(serverId),
        kelasId = Value(kelasId),
        kelasNama = Value(kelasNama),
        mataPelajaranId = Value(mataPelajaranId),
        mataPelajaranNama = Value(mataPelajaranNama),
        hari = Value(hari),
        jamKe = Value(jamKe),
        cachedAt = Value(cachedAt);
  static Insertable<CachedSchedule> custom({
    Expression<String>? serverId,
    Expression<String>? kelasId,
    Expression<String>? kelasNama,
    Expression<String>? mataPelajaranId,
    Expression<String>? mataPelajaranNama,
    Expression<String>? hari,
    Expression<int>? jamKe,
    Expression<DateTime>? cachedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (serverId != null) 'server_id': serverId,
      if (kelasId != null) 'kelas_id': kelasId,
      if (kelasNama != null) 'kelas_nama': kelasNama,
      if (mataPelajaranId != null) 'mata_pelajaran_id': mataPelajaranId,
      if (mataPelajaranNama != null) 'mata_pelajaran_nama': mataPelajaranNama,
      if (hari != null) 'hari': hari,
      if (jamKe != null) 'jam_ke': jamKe,
      if (cachedAt != null) 'cached_at': cachedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  CachedSchedulesCompanion copyWith(
      {Value<String>? serverId,
      Value<String>? kelasId,
      Value<String>? kelasNama,
      Value<String>? mataPelajaranId,
      Value<String>? mataPelajaranNama,
      Value<String>? hari,
      Value<int>? jamKe,
      Value<DateTime>? cachedAt,
      Value<int>? rowid}) {
    return CachedSchedulesCompanion(
      serverId: serverId ?? this.serverId,
      kelasId: kelasId ?? this.kelasId,
      kelasNama: kelasNama ?? this.kelasNama,
      mataPelajaranId: mataPelajaranId ?? this.mataPelajaranId,
      mataPelajaranNama: mataPelajaranNama ?? this.mataPelajaranNama,
      hari: hari ?? this.hari,
      jamKe: jamKe ?? this.jamKe,
      cachedAt: cachedAt ?? this.cachedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (serverId.present) {
      map['server_id'] = Variable<String>(serverId.value);
    }
    if (kelasId.present) {
      map['kelas_id'] = Variable<String>(kelasId.value);
    }
    if (kelasNama.present) {
      map['kelas_nama'] = Variable<String>(kelasNama.value);
    }
    if (mataPelajaranId.present) {
      map['mata_pelajaran_id'] = Variable<String>(mataPelajaranId.value);
    }
    if (mataPelajaranNama.present) {
      map['mata_pelajaran_nama'] = Variable<String>(mataPelajaranNama.value);
    }
    if (hari.present) {
      map['hari'] = Variable<String>(hari.value);
    }
    if (jamKe.present) {
      map['jam_ke'] = Variable<int>(jamKe.value);
    }
    if (cachedAt.present) {
      map['cached_at'] = Variable<DateTime>(cachedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('CachedSchedulesCompanion(')
          ..write('serverId: $serverId, ')
          ..write('kelasId: $kelasId, ')
          ..write('kelasNama: $kelasNama, ')
          ..write('mataPelajaranId: $mataPelajaranId, ')
          ..write('mataPelajaranNama: $mataPelajaranNama, ')
          ..write('hari: $hari, ')
          ..write('jamKe: $jamKe, ')
          ..write('cachedAt: $cachedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $CachedStudentsTable extends CachedStudents
    with TableInfo<$CachedStudentsTable, CachedStudent> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $CachedStudentsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _siswaIdMeta =
      const VerificationMeta('siswaId');
  @override
  late final GeneratedColumn<String> siswaId = GeneratedColumn<String>(
      'siswa_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _kelasIdMeta =
      const VerificationMeta('kelasId');
  @override
  late final GeneratedColumn<String> kelasId = GeneratedColumn<String>(
      'kelas_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _namaMeta = const VerificationMeta('nama');
  @override
  late final GeneratedColumn<String> nama = GeneratedColumn<String>(
      'nama', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _nisnMeta = const VerificationMeta('nisn');
  @override
  late final GeneratedColumn<String> nisn = GeneratedColumn<String>(
      'nisn', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _cachedAtMeta =
      const VerificationMeta('cachedAt');
  @override
  late final GeneratedColumn<DateTime> cachedAt = GeneratedColumn<DateTime>(
      'cached_at', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  @override
  List<GeneratedColumn> get $columns =>
      [siswaId, kelasId, nama, nisn, cachedAt];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'cached_students';
  @override
  VerificationContext validateIntegrity(Insertable<CachedStudent> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('siswa_id')) {
      context.handle(_siswaIdMeta,
          siswaId.isAcceptableOrUnknown(data['siswa_id']!, _siswaIdMeta));
    } else if (isInserting) {
      context.missing(_siswaIdMeta);
    }
    if (data.containsKey('kelas_id')) {
      context.handle(_kelasIdMeta,
          kelasId.isAcceptableOrUnknown(data['kelas_id']!, _kelasIdMeta));
    } else if (isInserting) {
      context.missing(_kelasIdMeta);
    }
    if (data.containsKey('nama')) {
      context.handle(
          _namaMeta, nama.isAcceptableOrUnknown(data['nama']!, _namaMeta));
    } else if (isInserting) {
      context.missing(_namaMeta);
    }
    if (data.containsKey('nisn')) {
      context.handle(
          _nisnMeta, nisn.isAcceptableOrUnknown(data['nisn']!, _nisnMeta));
    }
    if (data.containsKey('cached_at')) {
      context.handle(_cachedAtMeta,
          cachedAt.isAcceptableOrUnknown(data['cached_at']!, _cachedAtMeta));
    } else if (isInserting) {
      context.missing(_cachedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {siswaId};
  @override
  CachedStudent map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return CachedStudent(
      siswaId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}siswa_id'])!,
      kelasId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}kelas_id'])!,
      nama: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}nama'])!,
      nisn: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}nisn']),
      cachedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}cached_at'])!,
    );
  }

  @override
  $CachedStudentsTable createAlias(String alias) {
    return $CachedStudentsTable(attachedDatabase, alias);
  }
}

class CachedStudent extends DataClass implements Insertable<CachedStudent> {
  /// Server UUID of the student.
  final String siswaId;

  /// Class UUID this student belongs to.
  final String kelasId;

  /// Student display name.
  final String nama;

  /// Student NISN (optional).
  final String? nisn;

  /// When this cache entry was last updated.
  final DateTime cachedAt;
  const CachedStudent(
      {required this.siswaId,
      required this.kelasId,
      required this.nama,
      this.nisn,
      required this.cachedAt});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['siswa_id'] = Variable<String>(siswaId);
    map['kelas_id'] = Variable<String>(kelasId);
    map['nama'] = Variable<String>(nama);
    if (!nullToAbsent || nisn != null) {
      map['nisn'] = Variable<String>(nisn);
    }
    map['cached_at'] = Variable<DateTime>(cachedAt);
    return map;
  }

  CachedStudentsCompanion toCompanion(bool nullToAbsent) {
    return CachedStudentsCompanion(
      siswaId: Value(siswaId),
      kelasId: Value(kelasId),
      nama: Value(nama),
      nisn: nisn == null && nullToAbsent ? const Value.absent() : Value(nisn),
      cachedAt: Value(cachedAt),
    );
  }

  factory CachedStudent.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return CachedStudent(
      siswaId: serializer.fromJson<String>(json['siswaId']),
      kelasId: serializer.fromJson<String>(json['kelasId']),
      nama: serializer.fromJson<String>(json['nama']),
      nisn: serializer.fromJson<String?>(json['nisn']),
      cachedAt: serializer.fromJson<DateTime>(json['cachedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'siswaId': serializer.toJson<String>(siswaId),
      'kelasId': serializer.toJson<String>(kelasId),
      'nama': serializer.toJson<String>(nama),
      'nisn': serializer.toJson<String?>(nisn),
      'cachedAt': serializer.toJson<DateTime>(cachedAt),
    };
  }

  CachedStudent copyWith(
          {String? siswaId,
          String? kelasId,
          String? nama,
          Value<String?> nisn = const Value.absent(),
          DateTime? cachedAt}) =>
      CachedStudent(
        siswaId: siswaId ?? this.siswaId,
        kelasId: kelasId ?? this.kelasId,
        nama: nama ?? this.nama,
        nisn: nisn.present ? nisn.value : this.nisn,
        cachedAt: cachedAt ?? this.cachedAt,
      );
  CachedStudent copyWithCompanion(CachedStudentsCompanion data) {
    return CachedStudent(
      siswaId: data.siswaId.present ? data.siswaId.value : this.siswaId,
      kelasId: data.kelasId.present ? data.kelasId.value : this.kelasId,
      nama: data.nama.present ? data.nama.value : this.nama,
      nisn: data.nisn.present ? data.nisn.value : this.nisn,
      cachedAt: data.cachedAt.present ? data.cachedAt.value : this.cachedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('CachedStudent(')
          ..write('siswaId: $siswaId, ')
          ..write('kelasId: $kelasId, ')
          ..write('nama: $nama, ')
          ..write('nisn: $nisn, ')
          ..write('cachedAt: $cachedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(siswaId, kelasId, nama, nisn, cachedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is CachedStudent &&
          other.siswaId == this.siswaId &&
          other.kelasId == this.kelasId &&
          other.nama == this.nama &&
          other.nisn == this.nisn &&
          other.cachedAt == this.cachedAt);
}

class CachedStudentsCompanion extends UpdateCompanion<CachedStudent> {
  final Value<String> siswaId;
  final Value<String> kelasId;
  final Value<String> nama;
  final Value<String?> nisn;
  final Value<DateTime> cachedAt;
  final Value<int> rowid;
  const CachedStudentsCompanion({
    this.siswaId = const Value.absent(),
    this.kelasId = const Value.absent(),
    this.nama = const Value.absent(),
    this.nisn = const Value.absent(),
    this.cachedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  CachedStudentsCompanion.insert({
    required String siswaId,
    required String kelasId,
    required String nama,
    this.nisn = const Value.absent(),
    required DateTime cachedAt,
    this.rowid = const Value.absent(),
  })  : siswaId = Value(siswaId),
        kelasId = Value(kelasId),
        nama = Value(nama),
        cachedAt = Value(cachedAt);
  static Insertable<CachedStudent> custom({
    Expression<String>? siswaId,
    Expression<String>? kelasId,
    Expression<String>? nama,
    Expression<String>? nisn,
    Expression<DateTime>? cachedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (siswaId != null) 'siswa_id': siswaId,
      if (kelasId != null) 'kelas_id': kelasId,
      if (nama != null) 'nama': nama,
      if (nisn != null) 'nisn': nisn,
      if (cachedAt != null) 'cached_at': cachedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  CachedStudentsCompanion copyWith(
      {Value<String>? siswaId,
      Value<String>? kelasId,
      Value<String>? nama,
      Value<String?>? nisn,
      Value<DateTime>? cachedAt,
      Value<int>? rowid}) {
    return CachedStudentsCompanion(
      siswaId: siswaId ?? this.siswaId,
      kelasId: kelasId ?? this.kelasId,
      nama: nama ?? this.nama,
      nisn: nisn ?? this.nisn,
      cachedAt: cachedAt ?? this.cachedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (siswaId.present) {
      map['siswa_id'] = Variable<String>(siswaId.value);
    }
    if (kelasId.present) {
      map['kelas_id'] = Variable<String>(kelasId.value);
    }
    if (nama.present) {
      map['nama'] = Variable<String>(nama.value);
    }
    if (nisn.present) {
      map['nisn'] = Variable<String>(nisn.value);
    }
    if (cachedAt.present) {
      map['cached_at'] = Variable<DateTime>(cachedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('CachedStudentsCompanion(')
          ..write('siswaId: $siswaId, ')
          ..write('kelasId: $kelasId, ')
          ..write('nama: $nama, ')
          ..write('nisn: $nisn, ')
          ..write('cachedAt: $cachedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

abstract class _$AppDatabase extends GeneratedDatabase {
  _$AppDatabase(QueryExecutor e) : super(e);
  _$AppDatabase.connect(DatabaseConnection c) : super.connect(c);
  $AppDatabaseManager get managers => $AppDatabaseManager(this);
  late final $AttendanceSyncQueueTable attendanceSyncQueue =
      $AttendanceSyncQueueTable(this);
  late final $CachedSchedulesTable cachedSchedules =
      $CachedSchedulesTable(this);
  late final $CachedStudentsTable cachedStudents = $CachedStudentsTable(this);
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities =>
      [attendanceSyncQueue, cachedSchedules, cachedStudents];
}

typedef $$AttendanceSyncQueueTableCreateCompanionBuilder
    = AttendanceSyncQueueCompanion Function({
  Value<int> id,
  required String siswaId,
  required String kelasId,
  required String tanggal,
  required String status,
  required DateTime eventTimestamp,
  Value<bool> isSynced,
  Value<DateTime?> lastSyncAttempt,
  Value<String?> syncError,
  Value<int> retryCount,
});
typedef $$AttendanceSyncQueueTableUpdateCompanionBuilder
    = AttendanceSyncQueueCompanion Function({
  Value<int> id,
  Value<String> siswaId,
  Value<String> kelasId,
  Value<String> tanggal,
  Value<String> status,
  Value<DateTime> eventTimestamp,
  Value<bool> isSynced,
  Value<DateTime?> lastSyncAttempt,
  Value<String?> syncError,
  Value<int> retryCount,
});

class $$AttendanceSyncQueueTableFilterComposer
    extends Composer<_$AppDatabase, $AttendanceSyncQueueTable> {
  $$AttendanceSyncQueueTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<int> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get siswaId => $composableBuilder(
      column: $table.siswaId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get kelasId => $composableBuilder(
      column: $table.kelasId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get tanggal => $composableBuilder(
      column: $table.tanggal, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get status => $composableBuilder(
      column: $table.status, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get eventTimestamp => $composableBuilder(
      column: $table.eventTimestamp,
      builder: (column) => ColumnFilters(column));

  ColumnFilters<bool> get isSynced => $composableBuilder(
      column: $table.isSynced, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get lastSyncAttempt => $composableBuilder(
      column: $table.lastSyncAttempt,
      builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get syncError => $composableBuilder(
      column: $table.syncError, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get retryCount => $composableBuilder(
      column: $table.retryCount, builder: (column) => ColumnFilters(column));
}

class $$AttendanceSyncQueueTableOrderingComposer
    extends Composer<_$AppDatabase, $AttendanceSyncQueueTable> {
  $$AttendanceSyncQueueTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<int> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get siswaId => $composableBuilder(
      column: $table.siswaId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get kelasId => $composableBuilder(
      column: $table.kelasId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get tanggal => $composableBuilder(
      column: $table.tanggal, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get status => $composableBuilder(
      column: $table.status, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get eventTimestamp => $composableBuilder(
      column: $table.eventTimestamp,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<bool> get isSynced => $composableBuilder(
      column: $table.isSynced, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get lastSyncAttempt => $composableBuilder(
      column: $table.lastSyncAttempt,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get syncError => $composableBuilder(
      column: $table.syncError, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get retryCount => $composableBuilder(
      column: $table.retryCount, builder: (column) => ColumnOrderings(column));
}

class $$AttendanceSyncQueueTableAnnotationComposer
    extends Composer<_$AppDatabase, $AttendanceSyncQueueTable> {
  $$AttendanceSyncQueueTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get siswaId =>
      $composableBuilder(column: $table.siswaId, builder: (column) => column);

  GeneratedColumn<String> get kelasId =>
      $composableBuilder(column: $table.kelasId, builder: (column) => column);

  GeneratedColumn<String> get tanggal =>
      $composableBuilder(column: $table.tanggal, builder: (column) => column);

  GeneratedColumn<String> get status =>
      $composableBuilder(column: $table.status, builder: (column) => column);

  GeneratedColumn<DateTime> get eventTimestamp => $composableBuilder(
      column: $table.eventTimestamp, builder: (column) => column);

  GeneratedColumn<bool> get isSynced =>
      $composableBuilder(column: $table.isSynced, builder: (column) => column);

  GeneratedColumn<DateTime> get lastSyncAttempt => $composableBuilder(
      column: $table.lastSyncAttempt, builder: (column) => column);

  GeneratedColumn<String> get syncError =>
      $composableBuilder(column: $table.syncError, builder: (column) => column);

  GeneratedColumn<int> get retryCount => $composableBuilder(
      column: $table.retryCount, builder: (column) => column);
}

class $$AttendanceSyncQueueTableTableManager extends RootTableManager<
    _$AppDatabase,
    $AttendanceSyncQueueTable,
    AttendanceSyncQueueData,
    $$AttendanceSyncQueueTableFilterComposer,
    $$AttendanceSyncQueueTableOrderingComposer,
    $$AttendanceSyncQueueTableAnnotationComposer,
    $$AttendanceSyncQueueTableCreateCompanionBuilder,
    $$AttendanceSyncQueueTableUpdateCompanionBuilder,
    (
      AttendanceSyncQueueData,
      BaseReferences<_$AppDatabase, $AttendanceSyncQueueTable,
          AttendanceSyncQueueData>
    ),
    AttendanceSyncQueueData,
    PrefetchHooks Function()> {
  $$AttendanceSyncQueueTableTableManager(
      _$AppDatabase db, $AttendanceSyncQueueTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$AttendanceSyncQueueTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$AttendanceSyncQueueTableOrderingComposer(
                  $db: db, $table: table),
          createComputedFieldComposer: () =>
              $$AttendanceSyncQueueTableAnnotationComposer(
                  $db: db, $table: table),
          updateCompanionCallback: ({
            Value<int> id = const Value.absent(),
            Value<String> siswaId = const Value.absent(),
            Value<String> kelasId = const Value.absent(),
            Value<String> tanggal = const Value.absent(),
            Value<String> status = const Value.absent(),
            Value<DateTime> eventTimestamp = const Value.absent(),
            Value<bool> isSynced = const Value.absent(),
            Value<DateTime?> lastSyncAttempt = const Value.absent(),
            Value<String?> syncError = const Value.absent(),
            Value<int> retryCount = const Value.absent(),
          }) =>
              AttendanceSyncQueueCompanion(
            id: id,
            siswaId: siswaId,
            kelasId: kelasId,
            tanggal: tanggal,
            status: status,
            eventTimestamp: eventTimestamp,
            isSynced: isSynced,
            lastSyncAttempt: lastSyncAttempt,
            syncError: syncError,
            retryCount: retryCount,
          ),
          createCompanionCallback: ({
            Value<int> id = const Value.absent(),
            required String siswaId,
            required String kelasId,
            required String tanggal,
            required String status,
            required DateTime eventTimestamp,
            Value<bool> isSynced = const Value.absent(),
            Value<DateTime?> lastSyncAttempt = const Value.absent(),
            Value<String?> syncError = const Value.absent(),
            Value<int> retryCount = const Value.absent(),
          }) =>
              AttendanceSyncQueueCompanion.insert(
            id: id,
            siswaId: siswaId,
            kelasId: kelasId,
            tanggal: tanggal,
            status: status,
            eventTimestamp: eventTimestamp,
            isSynced: isSynced,
            lastSyncAttempt: lastSyncAttempt,
            syncError: syncError,
            retryCount: retryCount,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$AttendanceSyncQueueTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $AttendanceSyncQueueTable,
    AttendanceSyncQueueData,
    $$AttendanceSyncQueueTableFilterComposer,
    $$AttendanceSyncQueueTableOrderingComposer,
    $$AttendanceSyncQueueTableAnnotationComposer,
    $$AttendanceSyncQueueTableCreateCompanionBuilder,
    $$AttendanceSyncQueueTableUpdateCompanionBuilder,
    (
      AttendanceSyncQueueData,
      BaseReferences<_$AppDatabase, $AttendanceSyncQueueTable,
          AttendanceSyncQueueData>
    ),
    AttendanceSyncQueueData,
    PrefetchHooks Function()>;
typedef $$CachedSchedulesTableCreateCompanionBuilder = CachedSchedulesCompanion
    Function({
  required String serverId,
  required String kelasId,
  required String kelasNama,
  required String mataPelajaranId,
  required String mataPelajaranNama,
  required String hari,
  required int jamKe,
  required DateTime cachedAt,
  Value<int> rowid,
});
typedef $$CachedSchedulesTableUpdateCompanionBuilder = CachedSchedulesCompanion
    Function({
  Value<String> serverId,
  Value<String> kelasId,
  Value<String> kelasNama,
  Value<String> mataPelajaranId,
  Value<String> mataPelajaranNama,
  Value<String> hari,
  Value<int> jamKe,
  Value<DateTime> cachedAt,
  Value<int> rowid,
});

class $$CachedSchedulesTableFilterComposer
    extends Composer<_$AppDatabase, $CachedSchedulesTable> {
  $$CachedSchedulesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get serverId => $composableBuilder(
      column: $table.serverId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get kelasId => $composableBuilder(
      column: $table.kelasId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get kelasNama => $composableBuilder(
      column: $table.kelasNama, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get mataPelajaranId => $composableBuilder(
      column: $table.mataPelajaranId,
      builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get mataPelajaranNama => $composableBuilder(
      column: $table.mataPelajaranNama,
      builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get hari => $composableBuilder(
      column: $table.hari, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get jamKe => $composableBuilder(
      column: $table.jamKe, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get cachedAt => $composableBuilder(
      column: $table.cachedAt, builder: (column) => ColumnFilters(column));
}

class $$CachedSchedulesTableOrderingComposer
    extends Composer<_$AppDatabase, $CachedSchedulesTable> {
  $$CachedSchedulesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get serverId => $composableBuilder(
      column: $table.serverId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get kelasId => $composableBuilder(
      column: $table.kelasId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get kelasNama => $composableBuilder(
      column: $table.kelasNama, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get mataPelajaranId => $composableBuilder(
      column: $table.mataPelajaranId,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get mataPelajaranNama => $composableBuilder(
      column: $table.mataPelajaranNama,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get hari => $composableBuilder(
      column: $table.hari, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get jamKe => $composableBuilder(
      column: $table.jamKe, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get cachedAt => $composableBuilder(
      column: $table.cachedAt, builder: (column) => ColumnOrderings(column));
}

class $$CachedSchedulesTableAnnotationComposer
    extends Composer<_$AppDatabase, $CachedSchedulesTable> {
  $$CachedSchedulesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get serverId =>
      $composableBuilder(column: $table.serverId, builder: (column) => column);

  GeneratedColumn<String> get kelasId =>
      $composableBuilder(column: $table.kelasId, builder: (column) => column);

  GeneratedColumn<String> get kelasNama =>
      $composableBuilder(column: $table.kelasNama, builder: (column) => column);

  GeneratedColumn<String> get mataPelajaranId => $composableBuilder(
      column: $table.mataPelajaranId, builder: (column) => column);

  GeneratedColumn<String> get mataPelajaranNama => $composableBuilder(
      column: $table.mataPelajaranNama, builder: (column) => column);

  GeneratedColumn<String> get hari =>
      $composableBuilder(column: $table.hari, builder: (column) => column);

  GeneratedColumn<int> get jamKe =>
      $composableBuilder(column: $table.jamKe, builder: (column) => column);

  GeneratedColumn<DateTime> get cachedAt =>
      $composableBuilder(column: $table.cachedAt, builder: (column) => column);
}

class $$CachedSchedulesTableTableManager extends RootTableManager<
    _$AppDatabase,
    $CachedSchedulesTable,
    CachedSchedule,
    $$CachedSchedulesTableFilterComposer,
    $$CachedSchedulesTableOrderingComposer,
    $$CachedSchedulesTableAnnotationComposer,
    $$CachedSchedulesTableCreateCompanionBuilder,
    $$CachedSchedulesTableUpdateCompanionBuilder,
    (
      CachedSchedule,
      BaseReferences<_$AppDatabase, $CachedSchedulesTable, CachedSchedule>
    ),
    CachedSchedule,
    PrefetchHooks Function()> {
  $$CachedSchedulesTableTableManager(
      _$AppDatabase db, $CachedSchedulesTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$CachedSchedulesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$CachedSchedulesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$CachedSchedulesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> serverId = const Value.absent(),
            Value<String> kelasId = const Value.absent(),
            Value<String> kelasNama = const Value.absent(),
            Value<String> mataPelajaranId = const Value.absent(),
            Value<String> mataPelajaranNama = const Value.absent(),
            Value<String> hari = const Value.absent(),
            Value<int> jamKe = const Value.absent(),
            Value<DateTime> cachedAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              CachedSchedulesCompanion(
            serverId: serverId,
            kelasId: kelasId,
            kelasNama: kelasNama,
            mataPelajaranId: mataPelajaranId,
            mataPelajaranNama: mataPelajaranNama,
            hari: hari,
            jamKe: jamKe,
            cachedAt: cachedAt,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String serverId,
            required String kelasId,
            required String kelasNama,
            required String mataPelajaranId,
            required String mataPelajaranNama,
            required String hari,
            required int jamKe,
            required DateTime cachedAt,
            Value<int> rowid = const Value.absent(),
          }) =>
              CachedSchedulesCompanion.insert(
            serverId: serverId,
            kelasId: kelasId,
            kelasNama: kelasNama,
            mataPelajaranId: mataPelajaranId,
            mataPelajaranNama: mataPelajaranNama,
            hari: hari,
            jamKe: jamKe,
            cachedAt: cachedAt,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$CachedSchedulesTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $CachedSchedulesTable,
    CachedSchedule,
    $$CachedSchedulesTableFilterComposer,
    $$CachedSchedulesTableOrderingComposer,
    $$CachedSchedulesTableAnnotationComposer,
    $$CachedSchedulesTableCreateCompanionBuilder,
    $$CachedSchedulesTableUpdateCompanionBuilder,
    (
      CachedSchedule,
      BaseReferences<_$AppDatabase, $CachedSchedulesTable, CachedSchedule>
    ),
    CachedSchedule,
    PrefetchHooks Function()>;
typedef $$CachedStudentsTableCreateCompanionBuilder = CachedStudentsCompanion
    Function({
  required String siswaId,
  required String kelasId,
  required String nama,
  Value<String?> nisn,
  required DateTime cachedAt,
  Value<int> rowid,
});
typedef $$CachedStudentsTableUpdateCompanionBuilder = CachedStudentsCompanion
    Function({
  Value<String> siswaId,
  Value<String> kelasId,
  Value<String> nama,
  Value<String?> nisn,
  Value<DateTime> cachedAt,
  Value<int> rowid,
});

class $$CachedStudentsTableFilterComposer
    extends Composer<_$AppDatabase, $CachedStudentsTable> {
  $$CachedStudentsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get siswaId => $composableBuilder(
      column: $table.siswaId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get kelasId => $composableBuilder(
      column: $table.kelasId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get nama => $composableBuilder(
      column: $table.nama, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get nisn => $composableBuilder(
      column: $table.nisn, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get cachedAt => $composableBuilder(
      column: $table.cachedAt, builder: (column) => ColumnFilters(column));
}

class $$CachedStudentsTableOrderingComposer
    extends Composer<_$AppDatabase, $CachedStudentsTable> {
  $$CachedStudentsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get siswaId => $composableBuilder(
      column: $table.siswaId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get kelasId => $composableBuilder(
      column: $table.kelasId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get nama => $composableBuilder(
      column: $table.nama, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get nisn => $composableBuilder(
      column: $table.nisn, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get cachedAt => $composableBuilder(
      column: $table.cachedAt, builder: (column) => ColumnOrderings(column));
}

class $$CachedStudentsTableAnnotationComposer
    extends Composer<_$AppDatabase, $CachedStudentsTable> {
  $$CachedStudentsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get siswaId =>
      $composableBuilder(column: $table.siswaId, builder: (column) => column);

  GeneratedColumn<String> get kelasId =>
      $composableBuilder(column: $table.kelasId, builder: (column) => column);

  GeneratedColumn<String> get nama =>
      $composableBuilder(column: $table.nama, builder: (column) => column);

  GeneratedColumn<String> get nisn =>
      $composableBuilder(column: $table.nisn, builder: (column) => column);

  GeneratedColumn<DateTime> get cachedAt =>
      $composableBuilder(column: $table.cachedAt, builder: (column) => column);
}

class $$CachedStudentsTableTableManager extends RootTableManager<
    _$AppDatabase,
    $CachedStudentsTable,
    CachedStudent,
    $$CachedStudentsTableFilterComposer,
    $$CachedStudentsTableOrderingComposer,
    $$CachedStudentsTableAnnotationComposer,
    $$CachedStudentsTableCreateCompanionBuilder,
    $$CachedStudentsTableUpdateCompanionBuilder,
    (
      CachedStudent,
      BaseReferences<_$AppDatabase, $CachedStudentsTable, CachedStudent>
    ),
    CachedStudent,
    PrefetchHooks Function()> {
  $$CachedStudentsTableTableManager(
      _$AppDatabase db, $CachedStudentsTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$CachedStudentsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$CachedStudentsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$CachedStudentsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> siswaId = const Value.absent(),
            Value<String> kelasId = const Value.absent(),
            Value<String> nama = const Value.absent(),
            Value<String?> nisn = const Value.absent(),
            Value<DateTime> cachedAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              CachedStudentsCompanion(
            siswaId: siswaId,
            kelasId: kelasId,
            nama: nama,
            nisn: nisn,
            cachedAt: cachedAt,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String siswaId,
            required String kelasId,
            required String nama,
            Value<String?> nisn = const Value.absent(),
            required DateTime cachedAt,
            Value<int> rowid = const Value.absent(),
          }) =>
              CachedStudentsCompanion.insert(
            siswaId: siswaId,
            kelasId: kelasId,
            nama: nama,
            nisn: nisn,
            cachedAt: cachedAt,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$CachedStudentsTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $CachedStudentsTable,
    CachedStudent,
    $$CachedStudentsTableFilterComposer,
    $$CachedStudentsTableOrderingComposer,
    $$CachedStudentsTableAnnotationComposer,
    $$CachedStudentsTableCreateCompanionBuilder,
    $$CachedStudentsTableUpdateCompanionBuilder,
    (
      CachedStudent,
      BaseReferences<_$AppDatabase, $CachedStudentsTable, CachedStudent>
    ),
    CachedStudent,
    PrefetchHooks Function()>;

class $AppDatabaseManager {
  final _$AppDatabase _db;
  $AppDatabaseManager(this._db);
  $$AttendanceSyncQueueTableTableManager get attendanceSyncQueue =>
      $$AttendanceSyncQueueTableTableManager(_db, _db.attendanceSyncQueue);
  $$CachedSchedulesTableTableManager get cachedSchedules =>
      $$CachedSchedulesTableTableManager(_db, _db.cachedSchedules);
  $$CachedStudentsTableTableManager get cachedStudents =>
      $$CachedStudentsTableTableManager(_db, _db.cachedStudents);
}
