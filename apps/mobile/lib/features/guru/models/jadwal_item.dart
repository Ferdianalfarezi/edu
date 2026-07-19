/// Represents a scheduled class for today's jadwal list.
class JadwalItem {
  const JadwalItem({
    required this.id,
    required this.kelasId,
    required this.kelasNama,
    required this.mataPelajaranId,
    required this.mataPelajaranNama,
    required this.jamKe,
  });

  factory JadwalItem.fromJson(Map<String, dynamic> json) {
    return JadwalItem(
      id: json['id'] as String? ?? json['kelasId'] as String,
      kelasId: json['kelasId'] as String? ?? json['kelas_id'] as String,
      kelasNama: json['kelasNama'] as String? ?? json['kelas_nama'] as String,
      mataPelajaranId: json['mataPelajaranId'] as String? ??
          json['mata_pelajaran_id'] as String? ??
          '',
      mataPelajaranNama: json['mataPelajaranNama'] as String? ??
          json['mata_pelajaran_nama'] as String? ??
          '',
      jamKe: json['jamKe'] as int? ?? json['jam_ke'] as int? ?? 0,
    );
  }

  final String id;
  final String kelasId;
  final String kelasNama;
  final String mataPelajaranId;
  final String mataPelajaranNama;
  final int jamKe;

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'kelas_id': kelasId,
      'kelas_nama': kelasNama,
      'mata_pelajaran_id': mataPelajaranId,
      'mata_pelajaran_nama': mataPelajaranNama,
      'jam_ke': jamKe,
    };
  }
}
