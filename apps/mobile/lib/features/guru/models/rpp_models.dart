/// Models for the RPP (Modul Ajar) feature.
///
/// Requirements: 41.1–41.11, 43.1–43.7, 44.1–44.5

/// Represents an RPP item in listing/search results.
class RppItem {
  const RppItem({
    required this.id,
    required this.judul,
    required this.guruNama,
    required this.mataPelajaranNama,
    required this.kategoriNama,
    required this.kontenType,
    required this.tahunTerbit,
    required this.status,
    this.tanggalPublish,
    this.isFavorited = false,
  });

  final String id;
  final String judul;
  final String guruNama;
  final String mataPelajaranNama;
  final String kategoriNama;
  final String kontenType; // 'richtext' or 'file'
  final int tahunTerbit;
  final String status; // 'draft' or 'published'
  final String? tanggalPublish;
  final bool isFavorited;

  factory RppItem.fromJson(Map<String, dynamic> json) {
    return RppItem(
      id: json['id'] as String,
      judul: json['judul'] as String,
      guruNama: json['guruNama'] as String? ?? '',
      mataPelajaranNama: json['mataPelajaranNama'] as String? ?? '',
      kategoriNama: json['kategoriNama'] as String? ?? '',
      kontenType: json['kontenType'] as String? ?? 'richtext',
      tahunTerbit: json['tahunTerbit'] as int? ?? DateTime.now().year,
      status: json['status'] as String? ?? 'draft',
      tanggalPublish: json['tanggalPublish'] as String?,
      isFavorited: json['isFavorited'] as bool? ?? false,
    );
  }
}

/// Full detail of a single RPP.
class RppDetail {
  const RppDetail({
    required this.id,
    required this.judul,
    required this.guruId,
    required this.guruNama,
    required this.mataPelajaranId,
    required this.mataPelajaranNama,
    required this.kategoriId,
    required this.kategoriNama,
    required this.kontenType,
    required this.tahunTerbit,
    required this.status,
    this.konten,
    this.fileNama,
    this.fileSize,
    this.tanggalPublish,
    this.tanggalUpdated,
    this.isFavorited = false,
  });

  final String id;
  final String judul;
  final String guruId;
  final String guruNama;
  final String mataPelajaranId;
  final String mataPelajaranNama;
  final String kategoriId;
  final String kategoriNama;
  final String kontenType;
  final int tahunTerbit;
  final String status;
  final String? konten; // Rich text HTML content
  final String? fileNama;
  final int? fileSize;
  final String? tanggalPublish;
  final String? tanggalUpdated;
  final bool isFavorited;

  factory RppDetail.fromJson(Map<String, dynamic> json) {
    return RppDetail(
      id: json['id'] as String,
      judul: json['judul'] as String,
      guruId: json['guruId'] as String? ?? '',
      guruNama: json['guruNama'] as String? ?? '',
      mataPelajaranId: json['mataPelajaranId'] as String? ?? '',
      mataPelajaranNama: json['mataPelajaranNama'] as String? ?? '',
      kategoriId: json['kategoriId'] as String? ?? '',
      kategoriNama: json['kategoriNama'] as String? ?? '',
      kontenType: json['kontenType'] as String? ?? 'richtext',
      tahunTerbit: json['tahunTerbit'] as int? ?? DateTime.now().year,
      status: json['status'] as String? ?? 'draft',
      konten: json['konten'] as String?,
      fileNama: json['fileNama'] as String?,
      fileSize: json['fileSize'] as int?,
      tanggalPublish: json['tanggalPublish'] as String?,
      tanggalUpdated: json['tanggalUpdated'] as String?,
      isFavorited: json['isFavorited'] as bool? ?? false,
    );
  }
}

/// Paginated list response for RPP endpoints.
class RppListResponse {
  const RppListResponse({
    required this.data,
    this.nextCursor,
    this.total,
  });

  final List<RppItem> data;
  final String? nextCursor;
  final int? total;

  factory RppListResponse.fromJson(Map<String, dynamic> json) {
    return RppListResponse(
      data: (json['data'] as List<dynamic>?)
              ?.map((e) => RppItem.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
      nextCursor: json['nextCursor'] as String?,
      total: json['total'] as int?,
    );
  }
}

/// Mata pelajaran option for dropdowns.
class MapelOption {
  const MapelOption({required this.id, required this.nama});

  final String id;
  final String nama;

  factory MapelOption.fromJson(Map<String, dynamic> json) {
    return MapelOption(
      id: json['id'] as String,
      nama: json['nama'] as String,
    );
  }
}

/// Kategori RPP option for dropdowns.
class KategoriOption {
  const KategoriOption({required this.id, required this.nama});

  final String id;
  final String nama;

  factory KategoriOption.fromJson(Map<String, dynamic> json) {
    return KategoriOption(
      id: json['id'] as String,
      nama: json['nama'] as String,
    );
  }
}
