/// Model representing a single teaching schedule entry for the guru.
class JadwalEntry {
  const JadwalEntry({
    required this.id,
    required this.kelasNama,
    required this.mataPelajaranNama,
    required this.jamMulai,
    required this.jamSelesai,
    required this.hasGuruPengganti,
    this.guruPenggantiNama,
  });

  final String id;
  final String kelasNama;
  final String mataPelajaranNama;
  final String jamMulai;
  final String jamSelesai;
  final bool hasGuruPengganti;
  final String? guruPenggantiNama;

  factory JadwalEntry.fromJson(Map<String, dynamic> json) {
    return JadwalEntry(
      id: json['id'] as String,
      kelasNama: json['kelasNama'] as String,
      mataPelajaranNama: json['mataPelajaranNama'] as String,
      jamMulai: json['jamMulai'] as String,
      jamSelesai: json['jamSelesai'] as String,
      hasGuruPengganti: json['hasGuruPengganti'] as bool? ?? false,
      guruPenggantiNama: json['guruPenggantiNama'] as String?,
    );
  }
}

/// Response from GET /jadwal/saya.
class JadwalSayaResponse {
  const JadwalSayaResponse({
    required this.hari,
    required this.tanggal,
    required this.jadwal,
  });

  final String hari;
  final String tanggal;
  final List<JadwalEntry> jadwal;

  factory JadwalSayaResponse.fromJson(Map<String, dynamic> json) {
    return JadwalSayaResponse(
      hari: json['hari'] as String,
      tanggal: json['tanggal'] as String,
      jadwal: (json['jadwal'] as List<dynamic>)
          .map((e) => JadwalEntry.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}
