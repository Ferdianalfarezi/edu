/// Models for parent rapor (report card) view.
///
/// Requirements: 39.1–39.5

/// A finalized rapor period available for viewing.
class RaporPeriode {
  const RaporPeriode({
    required this.periodeId,
    required this.periode,
    required this.tahunAjaran,
    this.finalizedAt,
  });

  final String periodeId;

  /// e.g. 'uts_semester_1', 'semester_1', 'uts_semester_2', 'semester_2'
  final String periode;
  final String tahunAjaran;
  final DateTime? finalizedAt;

  /// API returns: { rapor_id, periode, tahun_ajaran, ... }
  factory RaporPeriode.fromJson(Map<String, dynamic> json) {
    return RaporPeriode(
      periodeId: json['rapor_id'] as String? ??
          json['periode_id'] as String? ??
          json['id'] as String? ??
          '',
      periode: json['periode'] as String,
      tahunAjaran: json['tahun_ajaran'] as String? ?? '',
      finalizedAt: json['finalized_at'] != null
          ? DateTime.tryParse(json['finalized_at'] as String)
          : null,
    );
  }

  /// Human-readable label for the period.
  String get label {
    switch (periode) {
      case 'uts_semester_1':
        return 'UTS Semester 1';
      case 'semester_1':
        return 'Semester 1';
      case 'uts_semester_2':
        return 'UTS Semester 2';
      case 'semester_2':
        return 'Semester 2';
      default:
        return periode;
    }
  }
}

/// Full rapor detail for a child + period.
class RaporDetail {
  const RaporDetail({
    required this.siswaId,
    required this.siswaNama,
    required this.kelasNama,
    required this.periode,
    required this.tahunAjaran,
    required this.nilaiMapel,
    this.rataRata,
    this.peringkat,
    this.catatanWaliKelas,
    this.p5,
  });

  final String siswaId;
  final String siswaNama;
  final String kelasNama;
  final String periode;
  final String tahunAjaran;
  final List<NilaiMapel> nilaiMapel;
  final double? rataRata;
  final int? peringkat;
  final String? catatanWaliKelas;
  final List<P5Item>? p5;

  /// API returns: { rapor_id, periode, tahun_ajaran, nilai: [...], peringkat, rata_rata, catatan_wali_kelas, p5_deskripsi }
  factory RaporDetail.fromJson(Map<String, dynamic> json) {
    // API returns 'nilai' array with { mapel, komponen_nilai, capaian_pembelajaran }
    final nilaiList = (json['nilai'] as List<dynamic>?) ??
        (json['nilai_mapel'] as List<dynamic>?) ??
        [];
    final p5List = (json['p5_deskripsi'] as List<dynamic>?) ??
        (json['p5'] as List<dynamic>?) ??
        [];

    return RaporDetail(
      siswaId: json['siswa_id'] as String? ?? '',
      siswaNama: json['siswa_nama'] as String? ?? '',
      kelasNama: json['kelas_nama'] as String? ?? '',
      periode: json['periode'] as String? ?? '',
      tahunAjaran: json['tahun_ajaran'] as String? ?? '',
      nilaiMapel: nilaiList
          .map((e) => NilaiMapel.fromJson(e as Map<String, dynamic>))
          .toList(),
      rataRata: json['rata_rata'] != null
          ? double.tryParse(json['rata_rata'].toString())
          : null,
      peringkat: (json['peringkat'] as num?)?.toInt(),
      catatanWaliKelas: json['catatan_wali_kelas'] as String?,
      p5: p5List.isNotEmpty
          ? p5List
              .map((e) => P5Item.fromJson(e as Map<String, dynamic>))
              .toList()
          : null,
    );
  }

  /// Human-readable label for the period.
  String get periodeLabel {
    switch (periode) {
      case 'uts_semester_1':
        return 'UTS Semester 1';
      case 'semester_1':
        return 'Semester 1';
      case 'uts_semester_2':
        return 'UTS Semester 2';
      case 'semester_2':
        return 'Semester 2';
      default:
        return periode;
    }
  }
}

/// Grade values for a single subject.
class NilaiMapel {
  const NilaiMapel({
    required this.mapelNama,
    required this.komponen,
    this.capaianPembelajaran,
  });

  final String mapelNama;
  final List<KomponenNilai> komponen;
  final String? capaianPembelajaran;

  factory NilaiMapel.fromJson(Map<String, dynamic> json) {
    final komponenList = (json['komponen'] as List<dynamic>?) ??
        (json['komponen_nilai'] as List<dynamic>?) ??
        [];
    return NilaiMapel(
      mapelNama: json['mapel_nama'] as String? ??
          json['mapel'] as String? ??
          json['mata_pelajaran'] as String? ??
          '',
      komponen: komponenList
          .map((e) => KomponenNilai.fromJson(e as Map<String, dynamic>))
          .toList(),
      capaianPembelajaran: json['capaian_pembelajaran'] as String?,
    );
  }
}

/// A single grade component (angka, huruf, or deskripsi).
class KomponenNilai {
  const KomponenNilai({
    required this.nama,
    required this.nilai,
  });

  final String nama;

  /// Can be a number string or letter/description string.
  final String nilai;

  /// API returns: { komponen_id, nilai } or { nama, nilai }
  factory KomponenNilai.fromJson(Map<String, dynamic> json) {
    return KomponenNilai(
      nama: json['nama'] as String? ??
          json['komponen_nama'] as String? ??
          json['komponen_id'] as String? ??
          '',
      nilai: '${json['nilai'] ?? ''}',
    );
  }
}

/// P5 (Profil Pelajar Pancasila) dimension description.
class P5Item {
  const P5Item({
    required this.dimensi,
    required this.deskripsi,
  });

  final String dimensi;
  final String deskripsi;

  factory P5Item.fromJson(Map<String, dynamic> json) {
    return P5Item(
      dimensi: json['dimensi'] as String? ?? '',
      deskripsi: json['deskripsi'] as String? ?? '',
    );
  }
}
