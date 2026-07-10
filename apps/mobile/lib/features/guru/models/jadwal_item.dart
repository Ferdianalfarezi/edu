/// Represents a scheduled class for today's jadwal list.
class JadwalItem {
  const JadwalItem({
    required this.id,
    required this.kelasId,
    required this.kelasNama,
    required this.mataPelajaranId,
    required this.mataPelajaranNama,
    required this.jamMulai,
    required this.jamSelesai,
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
      jamMulai:
          json['jamMulai'] as String? ?? json['jam_mulai'] as String? ?? '',
      jamSelesai:
          json['jamSelesai'] as String? ?? json['jam_selesai'] as String? ?? '',
    );
  }

  final String id;
  final String kelasId;
  final String kelasNama;
  final String mataPelajaranId;
  final String mataPelajaranNama;
  final String jamMulai;
  final String jamSelesai;

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'kelas_id': kelasId,
      'kelas_nama': kelasNama,
      'mata_pelajaran_id': mataPelajaranId,
      'mata_pelajaran_nama': mataPelajaranNama,
      'jam_mulai': jamMulai,
      'jam_selesai': jamSelesai,
    };
  }
}
