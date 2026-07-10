// Models for parent attendance view.
//
// Requirements: 8.1–8.4, 21.9, 21.10

/// Single attendance record for a day.
class AttendanceRecord {
  const AttendanceRecord({
    required this.tanggal,
    required this.status,
  });

  factory AttendanceRecord.fromJson(Map<String, dynamic> json) {
    return AttendanceRecord(
      tanggal: DateTime.parse(json['tanggal'] as String),
      status: AttendanceStatus.fromString(json['status'] as String),
    );
  }

  final DateTime tanggal;
  final AttendanceStatus status;
}

/// Attendance status enum matching the backend.
enum AttendanceStatus {
  hadir,
  izin,
  sakit,
  alpa;

  static AttendanceStatus fromString(String value) {
    switch (value) {
      case 'hadir':
        return AttendanceStatus.hadir;
      case 'izin':
        return AttendanceStatus.izin;
      case 'sakit':
        return AttendanceStatus.sakit;
      case 'alpa':
        return AttendanceStatus.alpa;
      default:
        return AttendanceStatus.hadir;
    }
  }

  String get label {
    switch (this) {
      case AttendanceStatus.hadir:
        return 'Hadir';
      case AttendanceStatus.izin:
        return 'Izin';
      case AttendanceStatus.sakit:
        return 'Sakit';
      case AttendanceStatus.alpa:
        return 'Alpa';
    }
  }
}

/// Summary totals for a month.
class AttendanceSummary {
  const AttendanceSummary({
    this.hadir = 0,
    this.izin = 0,
    this.sakit = 0,
    this.alpa = 0,
  });

  factory AttendanceSummary.fromJson(Map<String, dynamic> json) {
    return AttendanceSummary(
      hadir: (json['hadir'] as num?)?.toInt() ?? 0,
      izin: (json['izin'] as num?)?.toInt() ?? 0,
      sakit: (json['sakit'] as num?)?.toInt() ?? 0,
      alpa: (json['alpa'] as num?)?.toInt() ?? 0,
    );
  }

  factory AttendanceSummary.fromRecords(List<AttendanceRecord> records) {
    int hadir = 0, izin = 0, sakit = 0, alpa = 0;
    for (final r in records) {
      switch (r.status) {
        case AttendanceStatus.hadir:
          hadir++;
          break;
        case AttendanceStatus.izin:
          izin++;
          break;
        case AttendanceStatus.sakit:
          sakit++;
          break;
        case AttendanceStatus.alpa:
          alpa++;
          break;
      }
    }
    return AttendanceSummary(
        hadir: hadir, izin: izin, sakit: sakit, alpa: alpa);
  }

  final int hadir;
  final int izin;
  final int sakit;
  final int alpa;
}

/// Response model for GET /absensi/anak/:siswaId.
/// API returns: { siswa_id, siswa_nama, bulan, tahun, ringkasan: {...}, hari: [...] }
class ChildAttendanceResponse {
  const ChildAttendanceResponse({
    required this.records,
    required this.summary,
  });

  factory ChildAttendanceResponse.fromJson(Map<String, dynamic> json) {
    // API returns attendance records in 'hari' array, not 'data'
    final data =
        json['hari'] as List<dynamic>? ?? json['data'] as List<dynamic>? ?? [];
    final records = data
        .map((e) => AttendanceRecord.fromJson(e as Map<String, dynamic>))
        .toList();

    // API returns summary in 'ringkasan', not 'summary'
    final summaryJson = json['ringkasan'] as Map<String, dynamic>? ??
        json['summary'] as Map<String, dynamic>?;
    final summary = summaryJson != null
        ? AttendanceSummary.fromJson(summaryJson)
        : AttendanceSummary.fromRecords(records);

    return ChildAttendanceResponse(records: records, summary: summary);
  }

  final List<AttendanceRecord> records;
  final AttendanceSummary summary;
}

/// Represents a child (siswa) belonging to a parent.
class ChildInfo {
  const ChildInfo({
    required this.siswaId,
    required this.nama,
    required this.kelasNama,
    required this.tenantId,
    required this.tenantNama,
  });

  factory ChildInfo.fromJson(Map<String, dynamic> json) {
    return ChildInfo(
      siswaId: json['siswa_id'] as String? ?? json['id'] as String,
      nama: json['nama'] as String,
      kelasNama: json['kelas_nama'] as String? ?? '',
      tenantId: json['tenant_id'] as String,
      tenantNama: json['tenant_nama'] as String? ??
          json['sekolah_nama'] as String? ??
          '',
    );
  }

  final String siswaId;
  final String nama;
  final String kelasNama;
  final String tenantId;
  final String tenantNama;
}

/// Groups children by school (tenant) for cross-tenant parent view.
/// Requirement 21.10: group by school.
class SchoolChildGroup {
  const SchoolChildGroup({
    required this.tenantId,
    required this.tenantNama,
    required this.children,
  });

  final String tenantId;
  final String tenantNama;
  final List<ChildInfo> children;
}
