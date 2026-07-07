import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:logger/logger.dart';

import '../../../core/constants/api_constants.dart';
import '../../../core/di/providers.dart';
import '../models/notification_models.dart';

final _logger = Logger(printer: SimplePrinter());

/// Provider for notification history with pagination.
///
/// Fetches notification list from GET /notifikasi/riwayat?page=&limit=
/// Sorted newest first.
/// Requirements: 7.1, 7.2
final notificationHistoryProvider = StateNotifierProvider.autoDispose<
    NotificationHistoryNotifier, NotificationHistoryState>(
  (ref) {
    final apiClient = ref.watch(apiClientProvider);
    return NotificationHistoryNotifier(apiClient: apiClient);
  },
);

/// State for paginated notification history.
class NotificationHistoryState {
  const NotificationHistoryState({
    this.items = const [],
    this.isLoading = false,
    this.isLoadingMore = false,
    this.error,
    this.nextCursor,
    this.hasMore = true,
  });

  final List<NotificationItem> items;
  final bool isLoading;
  final bool isLoadingMore;
  final String? error;
  final String? nextCursor;
  final bool hasMore;

  NotificationHistoryState copyWith({
    List<NotificationItem>? items,
    bool? isLoading,
    bool? isLoadingMore,
    String? error,
    String? nextCursor,
    bool? hasMore,
  }) {
    return NotificationHistoryState(
      items: items ?? this.items,
      isLoading: isLoading ?? this.isLoading,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      error: error,
      nextCursor: nextCursor ?? this.nextCursor,
      hasMore: hasMore ?? this.hasMore,
    );
  }
}

/// Notifier that handles paginated notification history fetching.
class NotificationHistoryNotifier
    extends StateNotifier<NotificationHistoryState> {
  NotificationHistoryNotifier({required dynamic apiClient})
      : _apiClient = apiClient,
        super(const NotificationHistoryState()) {
    fetchInitial();
  }

  final dynamic _apiClient;
  static const int _pageSize = 20;

  /// Fetch the first page of notifications.
  Future<void> fetchInitial() async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      final response = await _apiClient.dio.get(
        ApiConstants.notifikasiRiwayat,
        queryParameters: {'limit': _pageSize},
      );

      final parsed = NotificationHistoryResponse.fromJson(
        response.data as Map<String, dynamic>,
      );

      state = NotificationHistoryState(
        items: parsed.items,
        nextCursor: parsed.nextCursor,
        hasMore: parsed.hasMore,
      );
    } catch (e) {
      _logger.e('Failed to fetch notification history: $e');
      state = state.copyWith(
        isLoading: false,
        error: 'Gagal memuat riwayat notifikasi',
      );
    }
  }

  /// Load more notifications (next page).
  Future<void> loadMore() async {
    if (state.isLoadingMore || !state.hasMore || state.nextCursor == null) {
      return;
    }

    state = state.copyWith(isLoadingMore: true);

    try {
      final response = await _apiClient.dio.get(
        ApiConstants.notifikasiRiwayat,
        queryParameters: {
          'limit': _pageSize,
          'cursor': state.nextCursor,
        },
      );

      final parsed = NotificationHistoryResponse.fromJson(
        response.data as Map<String, dynamic>,
      );

      state = state.copyWith(
        items: [...state.items, ...parsed.items],
        isLoadingMore: false,
        nextCursor: parsed.nextCursor,
        hasMore: parsed.hasMore,
      );
    } catch (e) {
      _logger.e('Failed to load more notifications: $e');
      state = state.copyWith(isLoadingMore: false);
    }
  }

  /// Refresh the list from the beginning.
  Future<void> refresh() async {
    state = const NotificationHistoryState();
    await fetchInitial();
  }
}

/// Provider for notification preferences.
///
/// Fetches from GET /notifikasi/preferensi
/// Requirements: 25.1–25.4
final notificationPreferencesProvider = StateNotifierProvider.autoDispose<
    NotificationPreferencesNotifier, NotificationPreferencesState>(
  (ref) {
    final apiClient = ref.watch(apiClientProvider);
    return NotificationPreferencesNotifier(apiClient: apiClient);
  },
);

/// State for notification preferences.
class NotificationPreferencesState {
  const NotificationPreferencesState({
    this.preferences = const [],
    this.isLoading = false,
    this.error,
    this.updatingChildId,
  });

  final List<ChildNotificationPreference> preferences;
  final bool isLoading;
  final String? error;

  /// Which child's preference is currently being saved.
  final String? updatingChildId;

  NotificationPreferencesState copyWith({
    List<ChildNotificationPreference>? preferences,
    bool? isLoading,
    String? error,
    String? updatingChildId,
  }) {
    return NotificationPreferencesState(
      preferences: preferences ?? this.preferences,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      updatingChildId: updatingChildId,
    );
  }
}

/// Notifier that manages notification preference state + updates.
class NotificationPreferencesNotifier
    extends StateNotifier<NotificationPreferencesState> {
  NotificationPreferencesNotifier({required dynamic apiClient})
      : _apiClient = apiClient,
        super(const NotificationPreferencesState()) {
    fetchPreferences();
  }

  final dynamic _apiClient;

  /// Fetch current preferences from the API.
  Future<void> fetchPreferences() async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      final response = await _apiClient.dio.get(
        ApiConstants.notifikasiPreferensi,
      );

      final parsed = NotificationPreferencesResponse.fromJson(
        response.data as Map<String, dynamic>,
      );

      state = NotificationPreferencesState(preferences: parsed.preferences);
    } catch (e) {
      _logger.e('Failed to fetch notification preferences: $e');
      state = state.copyWith(
        isLoading: false,
        error: 'Gagal memuat preferensi notifikasi',
      );
    }
  }

  /// Toggle kehadiran notification for a child (auto-save).
  /// Requirement 25.3: save on toggle change.
  Future<void> toggleKehadiran(String siswaId, bool enabled) async {
    _updateLocalPreference(
      siswaId,
      (pref) => pref.copyWith(kehadiranEnabled: enabled),
    );
    await _savePreference(siswaId, kehadiranEnabled: enabled);
  }

  /// Toggle ketidakhadiran notification for a child (auto-save).
  /// Requirement 25.3: save on toggle change.
  Future<void> toggleKetidakhadiran(String siswaId, bool enabled) async {
    _updateLocalPreference(
      siswaId,
      (pref) => pref.copyWith(ketidakhadiranEnabled: enabled),
    );
    await _savePreference(siswaId, ketidakhadiranEnabled: enabled);
  }

  /// Update local state optimistically.
  void _updateLocalPreference(
    String siswaId,
    ChildNotificationPreference Function(ChildNotificationPreference) updater,
  ) {
    final updated = state.preferences.map((pref) {
      if (pref.siswaId == siswaId) {
        return updater(pref);
      }
      return pref;
    }).toList();

    state = state.copyWith(preferences: updated);
  }

  /// Save preference to backend via PATCH /notifikasi/preferensi.
  Future<void> _savePreference(
    String siswaId, {
    bool? kehadiranEnabled,
    bool? ketidakhadiranEnabled,
  }) async {
    state = state.copyWith(updatingChildId: siswaId);

    try {
      final body = <String, dynamic>{'anak_id': siswaId};
      if (kehadiranEnabled != null) {
        body['kehadiran_enabled'] = kehadiranEnabled;
      }
      if (ketidakhadiranEnabled != null) {
        body['ketidakhadiran_enabled'] = ketidakhadiranEnabled;
      }

      await _apiClient.dio.patch(
        ApiConstants.notifikasiPreferensi,
        data: body,
      );

      state = state.copyWith(updatingChildId: null);
    } catch (e) {
      _logger.e('Failed to save notification preference: $e');
      // Revert on failure by re-fetching
      await fetchPreferences();
    }
  }
}
