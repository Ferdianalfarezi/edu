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

  final String id;
  final String kelasId;
  final String kelasNama;
  final String mataPelajaranId;
  final String mataPelajaranNama;
  final String jamMulai;
  final String jamSelesai;

  factory JadwalItem.fromJson(Map<String, dynamic> json) {
    return JadwalItem(
      id: json['id'] as String,
      kelasId: json['kelas_id'] as String,
      kelasNama: json['kelas_nama'] as String,
      mataPelajaranId: json['mata_pelajaran_id'] as String,
      mataPelajaranNama: json['mata_pelajaran_nama'] as String,
      jamMulai: json['jam_mulai'] as String,
      jamSelesai: json['jam_selesai'] as String,
    );
  }

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
