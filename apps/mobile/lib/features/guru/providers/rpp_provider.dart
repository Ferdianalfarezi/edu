import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../models/rpp_models.dart';

/// Filter state for RPP portal search.
class RppFilter {
  const RppFilter({
    this.search,
    this.kategori,
    this.mapelId,
    this.tahun,
  });

  final String? search;
  final String? kategori;
  final String? mapelId;
  final int? tahun;

  RppFilter copyWith({
    String? search,
    String? kategori,
    String? mapelId,
    int? tahun,
    bool clearSearch = false,
    bool clearKategori = false,
    bool clearMapel = false,
    bool clearTahun = false,
  }) {
    return RppFilter(
      search: clearSearch ? null : (search ?? this.search),
      kategori: clearKategori ? null : (kategori ?? this.kategori),
      mapelId: clearMapel ? null : (mapelId ?? this.mapelId),
      tahun: clearTahun ? null : (tahun ?? this.tahun),
    );
  }

  Map<String, dynamic> toQueryParameters() {
    final params = <String, dynamic>{};
    if (search != null && search!.isNotEmpty) params['search'] = search;
    if (kategori != null && kategori!.isNotEmpty) params['kategori'] = kategori;
    if (mapelId != null && mapelId!.isNotEmpty) params['mapel'] = mapelId;
    if (tahun != null) params['tahun'] = tahun;
    return params;
  }
}

/// Current RPP filter state.
final rppFilterProvider = StateProvider<RppFilter>((ref) {
  return const RppFilter();
});

/// Fetches the list of published RPPs for the portal (Req 43.1, 43.2, 43.3, 43.7).
final rppListProvider =
    FutureProvider.autoDispose<RppListResponse>((ref) async {
  final apiClient = ref.watch(apiClientProvider);
  final filter = ref.watch(rppFilterProvider);

  final response = await apiClient.dio.get(
    '/rpp',
    queryParameters: filter.toQueryParameters(),
  );

  return RppListResponse.fromJson(response.data as Map<String, dynamic>);
});

/// Fetches a single RPP detail by ID (Req 43.4).
/// API returns the detail directly (not wrapped in { data: ... }).
final rppDetailProvider =
    FutureProvider.autoDispose.family<RppDetail, String>((ref, rppId) async {
  final apiClient = ref.watch(apiClientProvider);

  final response = await apiClient.dio.get('/rpp/$rppId');

  // API may return { data: {...} } or the detail directly
  final responseData = response.data as Map<String, dynamic>;
  final detailJson =
      responseData.containsKey('data') && responseData['data'] is Map
          ? responseData['data'] as Map<String, dynamic>
          : responseData;

  return RppDetail.fromJson(detailJson);
});

/// Fetches the user's favorited RPPs list (Req 44.3).
/// API returns an array directly or wrapped in { data: [...] }.
final rppFavoritesProvider =
    FutureProvider.autoDispose<RppListResponse>((ref) async {
  final apiClient = ref.watch(apiClientProvider);

  final response = await apiClient.dio.get('/rpp/favorit');

  // API may return raw array or { data: [...] } wrapper
  if (response.data is List) {
    return RppListResponse(
      data: (response.data as List<dynamic>)
          .map((e) => RppItem.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
  return RppListResponse.fromJson(response.data as Map<String, dynamic>);
});

/// Fetches available mata pelajaran for dropdowns.
final mapelOptionsProvider =
    FutureProvider.autoDispose<List<MapelOption>>((ref) async {
  final apiClient = ref.watch(apiClientProvider);

  final response = await apiClient.dio.get('/mata-pelajaran');

  // API may return { data: [...] } or raw array
  List<dynamic> list;
  if (response.data is List) {
    list = response.data as List<dynamic>;
  } else if (response.data is Map<String, dynamic>) {
    list =
        (response.data as Map<String, dynamic>)['data'] as List<dynamic>? ?? [];
  } else {
    list = [];
  }
  return list
      .map((e) => MapelOption.fromJson(e as Map<String, dynamic>))
      .toList();
});

/// Fetches available kategori RPP options for dropdowns (Req 41.3, 41.4).
final kategoriOptionsProvider =
    FutureProvider.autoDispose<List<KategoriOption>>((ref) async {
  final apiClient = ref.watch(apiClientProvider);

  final response = await apiClient.dio.get('/rpp/kategori');

  // API may return { data: [...] } or raw array
  List<dynamic> list;
  if (response.data is List) {
    list = response.data as List<dynamic>;
  } else if (response.data is Map<String, dynamic>) {
    list =
        (response.data as Map<String, dynamic>)['data'] as List<dynamic>? ?? [];
  } else {
    list = [];
  }
  return list
      .map((e) => KategoriOption.fromJson(e as Map<String, dynamic>))
      .toList();
});

/// Notifier for toggling RPP favorite status (Req 44.1, 44.2).
class RppFavoriteNotifier extends StateNotifier<Map<String, bool>> {
  RppFavoriteNotifier(this._ref) : super({});

  final Ref _ref;

  /// Toggle favorite for a given RPP ID.
  Future<void> toggleFavorite(String rppId,
      {required bool currentState}) async {
    final apiClient = _ref.read(apiClientProvider);

    // Optimistic update
    state = {...state, rppId: !currentState};

    try {
      await apiClient.dio.post('/rpp/$rppId/favorite');
      // Refresh favorites list
      _ref.invalidate(rppFavoritesProvider);
    } catch (e) {
      // Revert on failure
      state = {...state, rppId: currentState};
      rethrow;
    }
  }

  /// Get the current favorite state for an RPP (checks local overrides first).
  bool isFavorited(String rppId, {required bool serverState}) {
    return state.containsKey(rppId) ? state[rppId]! : serverState;
  }
}

final rppFavoriteNotifierProvider =
    StateNotifierProvider<RppFavoriteNotifier, Map<String, bool>>((ref) {
  return RppFavoriteNotifier(ref);
});

/// Creates a new RPP (Req 41.1–41.10).
/// Returns the created RPP ID on success.
Future<String> createRpp({
  required WidgetRef ref,
  required String judul,
  required String mataPelajaranId,
  required String kategori,
  required int tahunTerbit,
  required String kontenType,
  required String status,
  String? konten,
  String? filePath,
  String? fileName,
}) async {
  final apiClient = ref.read(apiClientProvider);

  if (kontenType == 'file' && filePath != null) {
    // Multipart upload for file-based RPP
    final formData = FormData.fromMap({
      'judul': judul,
      'mata_pelajaran_id': mataPelajaranId,
      'kategori': kategori,
      'tahun_terbit': tahunTerbit,
      'konten_type': kontenType,
      'status': status,
      'file': await MultipartFile.fromFile(filePath, filename: fileName),
    });

    final response = await apiClient.dio.post(
      '/rpp',
      data: formData,
      options: Options(contentType: 'multipart/form-data'),
    );

    return response.data['id'] as String;
  } else {
    // JSON body for rich text RPP
    final response = await apiClient.dio.post(
      '/rpp',
      data: {
        'judul': judul,
        'mata_pelajaran_id': mataPelajaranId,
        'kategori': kategori,
        'tahun_terbit': tahunTerbit,
        'konten_type': kontenType,
        'konten': konten,
        'status': status,
      },
    );

    return response.data['id'] as String;
  }
}

/// Downloads an RPP file by getting the presigned URL (Req 43.5).
Future<String> getRppDownloadUrl({
  required WidgetRef ref,
  required String rppId,
}) async {
  final apiClient = ref.read(apiClientProvider);

  final response = await apiClient.dio.get('/rpp/$rppId/download');

  return response.data['url'] as String;
}
