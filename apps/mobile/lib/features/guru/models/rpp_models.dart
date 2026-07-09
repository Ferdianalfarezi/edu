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

  /// API returns snake_case keys: konten_type, tahun_terbit, guru_nama, mata_pelajaran, kategori
  factory RppItem.fromJson(Map<String, dynamic> json) {
    return RppItem(
      id: json['id'] as String,
      judul: json['judul'] as String,
      guruNama:
          json['guruNama'] as String? ?? json['guru_nama'] as String? ?? '',
      mataPelajaranNama: json['mataPelajaranNama'] as String? ??
          json['mata_pelajaran'] as String? ??
          json['mata_pelajaran_nama'] as String? ??
          '',
      kategoriNama: json['kategoriNama'] as String? ??
          json['kategori'] as String? ??
          json['kategori_nama'] as String? ??
          '',
      kontenType: json['kontenType'] as String? ??
          json['konten_type'] as String? ??
          'richtext',
      tahunTerbit: json['tahunTerbit'] as int? ??
          json['tahun_terbit'] as int? ??
          DateTime.now().year,
      status: json['status'] as String? ?? 'draft',
      tanggalPublish: json['tanggalPublish'] as String? ??
          json['tanggal_publish']?.toString(),
      isFavorited: json['isFavorited'] as bool? ??
          json['is_favorited'] as bool? ??
          false,
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

  /// API returns snake_case keys with nested guru object
  factory RppDetail.fromJson(Map<String, dynamic> json) {
    // guru can be a nested object { id, nama } or flat fields
    final guruObj = json['guru'] as Map<String, dynamic>?;
    return RppDetail(
      id: json['id'] as String,
      judul: json['judul'] as String,
      guruId: json['guruId'] as String? ??
          json['guru_id'] as String? ??
          guruObj?['id'] as String? ??
          '',
      guruNama: json['guruNama'] as String? ??
          json['guru_nama'] as String? ??
          guruObj?['nama'] as String? ??
          '',
      mataPelajaranId: json['mataPelajaranId'] as String? ??
          json['mata_pelajaran_id'] as String? ??
          '',
      mataPelajaranNama: json['mataPelajaranNama'] as String? ??
          json['mata_pelajaran'] as String? ??
          json['mata_pelajaran_nama'] as String? ??
          '',
      kategoriId:
          json['kategoriId'] as String? ?? json['kategori_id'] as String? ?? '',
      kategoriNama: json['kategoriNama'] as String? ??
          json['kategori'] as String? ??
          json['kategori_nama'] as String? ??
          '',
      kontenType: json['kontenType'] as String? ??
          json['konten_type'] as String? ??
          'richtext',
      tahunTerbit: json['tahunTerbit'] as int? ??
          json['tahun_terbit'] as int? ??
          DateTime.now().year,
      status: json['status'] as String? ?? 'draft',
      konten: json['konten'] as String?,
      fileNama: json['fileNama'] as String? ?? json['file_nama'] as String?,
      fileSize: json['fileSize'] as int? ?? json['file_size'] as int?,
      tanggalPublish: json['tanggalPublish'] as String? ??
          json['tanggal_publish']?.toString(),
      tanggalUpdated:
          json['tanggalUpdated'] as String? ?? json['updated_at']?.toString(),
      isFavorited: json['isFavorited'] as bool? ??
          json['is_favorited'] as bool? ??
          false,
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

  /// API returns: { data: [...], meta: { has_next, cursor } }
  factory RppListResponse.fromJson(Map<String, dynamic> json) {
    final meta = json['meta'] as Map<String, dynamic>?;
    return RppListResponse(
      data: (json['data'] as List<dynamic>?)
              ?.map((e) => RppItem.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
      nextCursor: meta?['cursor'] as String? ?? json['nextCursor'] as String?,
      total: meta?['total'] as int? ?? json['total'] as int?,
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
