/// Result from a sync operation returned by the server.
class SyncResult {
  const SyncResult({
    required this.synced,
    required this.conflicts,
  });

  /// IDs of records successfully synced.
  final List<String> synced;

  /// Conflict resolutions with details.
  final List<SyncConflict> conflicts;

  factory SyncResult.fromJson(Map<String, dynamic> json) {
    return SyncResult(
      synced: (json['synced'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          [],
      conflicts: (json['conflicts'] as List<dynamic>?)
              ?.map(
                  (e) => SyncConflict.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
    );
  }
}

/// A single conflict resolution result.
class SyncConflict {
  const SyncConflict({
    required this.siswaId,
    required this.tanggal,
    required this.winner,
    required this.reason,
    this.serverValue,
  });

  final String siswaId;
  final String tanggal;

  /// 'server' or 'client'
  final String winner;

  /// 'authority_override', 'server_newer', 'client_newer'
  final String reason;

  /// The server's current value (shown to teacher when overridden).
  final String? serverValue;

  factory SyncConflict.fromJson(Map<String, dynamic> json) {
    return SyncConflict(
      siswaId: json['siswa_id'] as String,
      tanggal: json['tanggal'] as String,
      winner: json['winner'] as String,
      reason: json['reason'] as String,
      serverValue: json['server_value'] as String?,
    );
  }

  /// Human-readable reason in Indonesian.
  String get reasonDisplay {
    switch (reason) {
      case 'authority_override':
        return 'Input Anda diganti oleh Kepala Sekolah';
      case 'server_newer':
        return 'Data server lebih baru';
      case 'client_newer':
        return 'Data Anda diterima';
      default:
        return reason;
    }
  }
}
