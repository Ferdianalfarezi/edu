/// Represents a student with their attendance status for input.
class StudentAttendance {
  StudentAttendance({
    required this.siswaId,
    required this.nama,
    this.nisn,
    this.status,
    this.keterangan,
  });

  factory StudentAttendance.fromJson(Map<String, dynamic> json) {
    return StudentAttendance(
      siswaId: json['siswa_id'] as String? ?? json['id'] as String,
      nama: json['nama'] as String,
      nisn: json['nisn'] as String?,
      status: json['status'] as String?,
      keterangan: json['keterangan'] as String?,
    );
  }

  final String siswaId;
  final String nama;
  final String? nisn;
  String? status; // hadir, izin, sakit, alpa
  String? keterangan;
}

/// Possible attendance status values.
enum AttendanceStatus {
  hadir('hadir', 'Hadir'),
  izin('izin', 'Izin'),
  sakit('sakit', 'Sakit'),
  alpa('alpa', 'Alpa');

  const AttendanceStatus(this.value, this.label);

  final String value;
  final String label;

  static AttendanceStatus? fromValue(String? value) {
    if (value == null) return null;
    return AttendanceStatus.values.firstWhere(
      (s) => s.value == value,
      orElse: () => AttendanceStatus.hadir,
    );
  }
}
