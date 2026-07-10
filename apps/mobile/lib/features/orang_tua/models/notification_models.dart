// Models for notification history and preferences.
//
// Requirements: 7.1–7.3, 25.1–25.4

/// A single notification history item.
class NotificationItem {
  const NotificationItem({
    required this.id,
    required this.tipe,
    required this.judul,
    required this.pesan,
    required this.statusPengiriman,
    required this.createdAt,
    this.siswaId,
    this.siswaName,
    this.data,
    this.sentAt,
  });

  factory NotificationItem.fromJson(Map<String, dynamic> json) {
    return NotificationItem(
      id: json['id'] as String,
      tipe: json['tipe'] as String,
      judul: json['judul'] as String,
      pesan: json['pesan'] as String,
      statusPengiriman: NotificationDeliveryStatus.fromString(
        json['status_pengiriman'] as String? ?? 'pending',
      ),
      createdAt: DateTime.parse(json['created_at'] as String),
      siswaId: json['siswa_id'] as String?,
      siswaName: json['siswa_nama'] as String?,
      data: json['data'] as Map<String, dynamic>?,
      sentAt: json['sent_at'] != null
          ? DateTime.parse(json['sent_at'] as String)
          : null,
    );
  }

  final String id;
  final String tipe;
  final String judul;
  final String pesan;
  final NotificationDeliveryStatus statusPengiriman;
  final DateTime createdAt;
  final String? siswaId;
  final String? siswaName;
  final Map<String, dynamic>? data;
  final DateTime? sentAt;

  /// Whether this notification has been read (proxy: if it was delivered/sent).
  bool get isRead => sentAt != null;

  /// Icon data based on notification type.
  NotificationType get notificationType => NotificationType.fromString(tipe);
}

/// Delivery status of a notification.
enum NotificationDeliveryStatus {
  pending,
  terkirim,
  gagal;

  static NotificationDeliveryStatus fromString(String value) {
    switch (value) {
      case 'terkirim':
        return NotificationDeliveryStatus.terkirim;
      case 'gagal':
        return NotificationDeliveryStatus.gagal;
      case 'pending':
      default:
        return NotificationDeliveryStatus.pending;
    }
  }

  String get label {
    switch (this) {
      case NotificationDeliveryStatus.pending:
        return 'Menunggu';
      case NotificationDeliveryStatus.terkirim:
        return 'Terkirim';
      case NotificationDeliveryStatus.gagal:
        return 'Gagal';
    }
  }
}

/// Notification type categories.
enum NotificationType {
  kehadiran,
  ketidakhadiran,
  tagihanBaru,
  verifikasi,
  rapor,
  other;

  static NotificationType fromString(String value) {
    switch (value) {
      case 'kehadiran':
        return NotificationType.kehadiran;
      case 'ketidakhadiran':
        return NotificationType.ketidakhadiran;
      case 'tagihan_baru':
      case 'tagihan_jatuh_tempo':
        return NotificationType.tagihanBaru;
      case 'verifikasi':
        return NotificationType.verifikasi;
      case 'rapor':
      case 'rapor_final':
        return NotificationType.rapor;
      default:
        return NotificationType.other;
    }
  }

  String get label {
    switch (this) {
      case NotificationType.kehadiran:
        return 'Kehadiran';
      case NotificationType.ketidakhadiran:
        return 'Ketidakhadiran';
      case NotificationType.tagihanBaru:
        return 'Tagihan';
      case NotificationType.verifikasi:
        return 'Verifikasi';
      case NotificationType.rapor:
        return 'Rapor';
      case NotificationType.other:
        return 'Lainnya';
    }
  }
}

/// Paginated response for notification history.
/// API: GET /notifikasi/riwayat?limit=&cursor=
/// Response shape: { data: [...], meta: { has_next, cursor } }
class NotificationHistoryResponse {
  const NotificationHistoryResponse({
    required this.items,
    this.nextCursor,
    this.hasMore = false,
  });

  factory NotificationHistoryResponse.fromJson(Map<String, dynamic> json) {
    final data = json['data'] as List<dynamic>? ?? [];
    final items = data
        .map((e) => NotificationItem.fromJson(e as Map<String, dynamic>))
        .toList();

    // API returns pagination in meta object: { has_next, cursor }
    final meta = json['meta'] as Map<String, dynamic>?;

    return NotificationHistoryResponse(
      items: items,
      nextCursor: meta?['cursor'] as String? ?? json['next_cursor'] as String?,
      hasMore: meta?['has_next'] as bool? ?? json['has_more'] as bool? ?? false,
    );
  }

  final List<NotificationItem> items;
  final String? nextCursor;
  final bool hasMore;
}

/// Notification preference for a single child.
class ChildNotificationPreference {
  const ChildNotificationPreference({
    required this.siswaId,
    required this.siswaName,
    required this.kelasNama,
    required this.kehadiranEnabled,
    required this.ketidakhadiranEnabled,
  });

  /// API returns: { anak_id, anak_nama, kehadiran_enabled, ketidakhadiran_enabled }
  factory ChildNotificationPreference.fromJson(Map<String, dynamic> json) {
    return ChildNotificationPreference(
      siswaId: json['anak_id'] as String? ?? json['siswa_id'] as String? ?? '',
      siswaName:
          json['anak_nama'] as String? ?? json['siswa_nama'] as String? ?? '',
      kelasNama: json['kelas_nama'] as String? ?? '',
      kehadiranEnabled: json['kehadiran_enabled'] as bool? ?? false,
      ketidakhadiranEnabled: json['ketidakhadiran_enabled'] as bool? ?? true,
    );
  }

  final String siswaId;
  final String siswaName;
  final String kelasNama;
  final bool kehadiranEnabled;
  final bool ketidakhadiranEnabled;

  ChildNotificationPreference copyWith({
    bool? kehadiranEnabled,
    bool? ketidakhadiranEnabled,
  }) {
    return ChildNotificationPreference(
      siswaId: siswaId,
      siswaName: siswaName,
      kelasNama: kelasNama,
      kehadiranEnabled: kehadiranEnabled ?? this.kehadiranEnabled,
      ketidakhadiranEnabled:
          ketidakhadiranEnabled ?? this.ketidakhadiranEnabled,
    );
  }
}

/// Response model for GET /notifikasi/preferensi.
/// API returns: { preferensi: [...] }
class NotificationPreferencesResponse {
  const NotificationPreferencesResponse({required this.preferences});

  factory NotificationPreferencesResponse.fromJson(Map<String, dynamic> json) {
    // API returns { preferensi: [...] }, not { data: [...] }
    final data = json['preferensi'] as List<dynamic>? ??
        json['data'] as List<dynamic>? ??
        [];
    return NotificationPreferencesResponse(
      preferences: data
          .map((e) =>
              ChildNotificationPreference.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  final List<ChildNotificationPreference> preferences;
}
