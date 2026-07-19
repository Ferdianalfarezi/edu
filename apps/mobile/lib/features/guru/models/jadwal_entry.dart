/// Model representing a single teaching schedule entry for the guru.
class JadwalEntry {
  const JadwalEntry({
    required this.id,
    required this.kelasNama,
    required this.mataPelajaranNama,
    required this.jamKe,
    required this.hasGuruPengganti,
    this.guruPenggantiNama,
  });

  factory JadwalEntry.fromJson(Map<String, dynamic> json) {
    return JadwalEntry(
      id: json['id'] as String,
      kelasNama: json['kelasNama'] as String,
      mataPelajaranNama: json['mataPelajaranNama'] as String,
      jamKe: json['jamKe'] as int? ?? 0,
      hasGuruPengganti: json['hasGuruPengganti'] as bool? ?? false,
      guruPenggantiNama: json['guruPenggantiNama'] as String?,
    );
  }

  final String id;
  final String kelasNama;
  final String mataPelajaranNama;
  final int jamKe;
  final bool hasGuruPengganti;
  final String? guruPenggantiNama;
}

/// Response from GET /jadwal/saya.
class JadwalSayaResponse {
  const JadwalSayaResponse({
    required this.hari,
    required this.tanggal,
    required this.jadwal,
  });

  factory JadwalSayaResponse.fromJson(Map<String, dynamic> json) {
    return JadwalSayaResponse(
      hari: json['hari'] as String,
      tanggal: json['tanggal'] as String,
      jadwal: (json['jadwal'] as List<dynamic>)
          .map((e) => JadwalEntry.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  final String hari;
  final String tanggal;
  final List<JadwalEntry> jadwal;
}
