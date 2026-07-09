/// Models for parent tagihan (billing) view.
///
/// Requirements: 11.1–11.17, 14.1–14.6

/// Tagihan status enum matching the backend.
enum TagihanStatus {
  belumBayar,
  menungguVerifikasi,
  cicilan,
  lunas,
  ditolak,
  dibatalkan;

  static TagihanStatus fromString(String value) {
    switch (value) {
      case 'belum_bayar':
        return TagihanStatus.belumBayar;
      case 'menunggu_verifikasi':
        return TagihanStatus.menungguVerifikasi;
      case 'cicilan':
        return TagihanStatus.cicilan;
      case 'lunas':
        return TagihanStatus.lunas;
      case 'ditolak':
        return TagihanStatus.ditolak;
      case 'dibatalkan':
        return TagihanStatus.dibatalkan;
      default:
        return TagihanStatus.belumBayar;
    }
  }

  String get label {
    switch (this) {
      case TagihanStatus.belumBayar:
        return 'Belum Bayar';
      case TagihanStatus.menungguVerifikasi:
        return 'Menunggu Verifikasi';
      case TagihanStatus.cicilan:
        return 'Cicilan';
      case TagihanStatus.lunas:
        return 'Lunas';
      case TagihanStatus.ditolak:
        return 'Ditolak';
      case TagihanStatus.dibatalkan:
        return 'Dibatalkan';
    }
  }

  /// Whether this status allows upload of bukti transfer.
  /// Requirement 11.1: belum_bayar, ditolak, or cicilan.
  bool get canUpload {
    return this == TagihanStatus.belumBayar ||
        this == TagihanStatus.ditolak ||
        this == TagihanStatus.cicilan;
  }
}

/// Single tagihan record for display.
/// Requirement 14.1, 14.2.
class Tagihan {
  const Tagihan({
    required this.id,
    required this.siswaId,
    required this.bulan,
    required this.tahun,
    required this.nominal,
    required this.totalDibayar,
    required this.status,
    this.tanggalJatuhTempo,
  });

  final String id;
  final String siswaId;
  final int bulan;
  final int tahun;
  final int nominal;
  final int totalDibayar;
  final TagihanStatus status;
  final DateTime? tanggalJatuhTempo;

  /// Remaining amount to be paid.
  /// Requirement 11.3: show sisa tagihan.
  int get sisa => nominal - totalDibayar;

  factory Tagihan.fromJson(Map<String, dynamic> json, {String? siswaId}) {
    return Tagihan(
      id: json['id'] as String,
      siswaId: json['siswa_id'] as String? ?? siswaId ?? '',
      bulan: (json['bulan'] as num).toInt(),
      tahun: (json['tahun'] as num).toInt(),
      nominal: (json['nominal'] as num).toInt(),
      totalDibayar: (json['total_dibayar'] as num?)?.toInt() ?? 0,
      status: TagihanStatus.fromString(json['status'] as String),
      tanggalJatuhTempo: json['tanggal_jatuh_tempo'] != null
          ? DateTime.tryParse(json['tanggal_jatuh_tempo'] as String)
          : null,
    );
  }
}

/// Transaction status for payment history.
enum TransaksiStatus {
  pending,
  approved,
  rejected;

  static TransaksiStatus fromString(String value) {
    switch (value) {
      case 'pending':
        return TransaksiStatus.pending;
      case 'approved':
        return TransaksiStatus.approved;
      case 'rejected':
        return TransaksiStatus.rejected;
      default:
        return TransaksiStatus.pending;
    }
  }

  String get label {
    switch (this) {
      case TransaksiStatus.pending:
        return 'Menunggu';
      case TransaksiStatus.approved:
        return 'Diterima';
      case TransaksiStatus.rejected:
        return 'Ditolak';
    }
  }
}

/// A single payment transaction in history.
/// Requirement 14.2, 14.4, 14.5.
class TagihanTransaksi {
  const TagihanTransaksi({
    required this.id,
    required this.tagihanId,
    required this.jumlahBayar,
    required this.metode,
    required this.status,
    this.alasanPenolakan,
    this.nomorReferensi,
    required this.createdAt,
  });

  final String id;
  final String tagihanId;
  final int jumlahBayar;
  final String metode;
  final TransaksiStatus status;
  final String? alasanPenolakan;
  final String? nomorReferensi;
  final DateTime createdAt;

  /// API pembayaran items: { id, nominal_bayar, tanggal_bayar, metode, nomor_referensi, verified_at }
  factory TagihanTransaksi.fromJson(Map<String, dynamic> json) {
    return TagihanTransaksi(
      id: json['id'] as String,
      tagihanId: json['tagihan_id'] as String? ?? '',
      jumlahBayar: (json['jumlah_bayar'] as num?)?.toInt() ??
          (json['nominal_bayar'] as num?)?.toInt() ??
          0,
      metode: json['metode'] as String? ?? 'upload_bukti',
      status:
          TransaksiStatus.fromString(json['status'] as String? ?? 'approved'),
      alasanPenolakan: json['alasan_penolakan'] as String?,
      nomorReferensi: json['nomor_referensi'] as String?,
      createdAt: json['created_at'] != null
          ? DateTime.parse(json['created_at'] as String)
          : json['tanggal_bayar'] != null
              ? DateTime.parse(json['tanggal_bayar'] as String)
              : DateTime.now(),
    );
  }
}
