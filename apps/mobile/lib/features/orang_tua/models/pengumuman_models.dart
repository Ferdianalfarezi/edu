// Models for pengumuman (announcement) detail.
//
// Requirements: 6.3

/// Detail of a single pengumuman (announcement).
class PengumumanDetail {
  const PengumumanDetail({
    required this.id,
    required this.judul,
    required this.deskripsi,
    required this.namaSekolah,
    required this.createdAt,
  });

  factory PengumumanDetail.fromJson(Map<String, dynamic> json) {
    return PengumumanDetail(
      id: json['id'] as String,
      judul: json['judul'] as String,
      deskripsi: json['deskripsi'] as String,
      namaSekolah: json['nama_sekolah'] as String,
      createdAt: DateTime.parse(json['created_at'] as String),
    );
  }

  final String id;
  final String judul;
  final String deskripsi;
  final String namaSekolah;
  final DateTime createdAt;
}
