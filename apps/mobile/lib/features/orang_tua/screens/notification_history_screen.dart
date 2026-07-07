import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/app_router.dart';
import '../models/notification_models.dart';
import '../providers/notification_provider.dart';

/// Notification history screen showing all past notifications.
///
/// Features:
/// - Paginated list of notifications (newest first)
/// - Each item: title, body, timestamp, delivery status, type icon
/// - Tap to view full content in a dialog
///
/// Requirements: 7.1, 7.2, 7.3
class NotificationHistoryScreen extends ConsumerStatefulWidget {
  const NotificationHistoryScreen({super.key});

  @override
  ConsumerState<NotificationHistoryScreen> createState() =>
      _NotificationHistoryScreenState();
}

class _NotificationHistoryScreenState
    extends ConsumerState<NotificationHistoryScreen> {
  final _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 200) {
      ref.read(notificationHistoryProvider.notifier).loadMore();
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(notificationHistoryProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Riwayat Notifikasi'),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings_outlined),
            tooltip: 'Pengaturan Notifikasi',
            onPressed: () {
              context.push(AppRoutes.orangTuaNotificationPreferences);
            },
          ),
        ],
      ),
      body: _buildBody(context, state),
    );
  }

  Widget _buildBody(BuildContext context, NotificationHistoryState state) {
    if (state.isLoading && state.items.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    if (state.error != null && state.items.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, size: 48, color: Colors.red),
              const SizedBox(height: 12),
              Text(
                state.error!,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () =>
                    ref.read(notificationHistoryProvider.notifier).refresh(),
                child: const Text('Coba Lagi'),
              ),
            ],
          ),
        ),
      );
    }

    if (state.items.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.notifications_none,
              size: 64,
              color: Colors.grey.shade400,
            ),
            const SizedBox(height: 12),
            Text(
              'Belum ada notifikasi',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: Colors.grey.shade600,
                  ),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () =>
          ref.read(notificationHistoryProvider.notifier).refresh(),
      child: ListView.separated(
        controller: _scrollController,
        padding: const EdgeInsets.symmetric(vertical: 8),
        itemCount: state.items.length + (state.isLoadingMore ? 1 : 0),
        separatorBuilder: (_, __) => const Divider(height: 1),
        itemBuilder: (context, index) {
          if (index >= state.items.length) {
            return const Padding(
              padding: EdgeInsets.all(16),
              child: Center(child: CircularProgressIndicator()),
            );
          }
          return _NotificationTile(
            item: state.items[index],
            onTap: () => _showNotificationDetail(context, state.items[index]),
          );
        },
      ),
    );
  }

  /// Show full notification content in a bottom sheet dialog.
  void _showNotificationDetail(BuildContext context, NotificationItem item) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (context) => _NotificationDetailSheet(item: item),
    );
  }
}

/// Single notification list tile.
class _NotificationTile extends StatelessWidget {
  const _NotificationTile({
    required this.item,
    required this.onTap,
  });

  final NotificationItem item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: _TypeIcon(type: item.notificationType),
      title: Text(
        item.judul,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(fontWeight: FontWeight.w600),
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 2),
          Text(
            item.pesan,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 13,
              color: Colors.grey.shade700,
            ),
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              Text(
                _formatTimestamp(item.createdAt),
                style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
              ),
              const SizedBox(width: 8),
              _DeliveryStatusBadge(status: item.statusPengiriman),
            ],
          ),
        ],
      ),
      isThreeLine: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      onTap: onTap,
    );
  }

  String _formatTimestamp(DateTime dt) {
    final now = DateTime.now();
    final diff = now.difference(dt);

    if (diff.inMinutes < 1) return 'Baru saja';
    if (diff.inHours < 1) return '${diff.inMinutes} menit lalu';
    if (diff.inHours < 24) return '${diff.inHours} jam lalu';
    if (diff.inDays < 7) return '${diff.inDays} hari lalu';

    final day = dt.day.toString().padLeft(2, '0');
    final month = dt.month.toString().padLeft(2, '0');
    return '$day/$month/${dt.year}';
  }
}

/// Type-based icon for notifications.
class _TypeIcon extends StatelessWidget {
  const _TypeIcon({required this.type});

  final NotificationType type;

  @override
  Widget build(BuildContext context) {
    final (IconData icon, Color color) = switch (type) {
      NotificationType.kehadiran => (Icons.check_circle, Colors.green),
      NotificationType.ketidakhadiran => (Icons.cancel, Colors.red),
      NotificationType.tagihanBaru => (Icons.receipt_long, Colors.orange),
      NotificationType.verifikasi => (Icons.verified, Colors.blue),
      NotificationType.rapor => (Icons.school, Colors.purple),
      NotificationType.other => (Icons.notifications, Colors.grey),
    };

    return CircleAvatar(
      backgroundColor: color.withOpacity(0.15),
      radius: 20,
      child: Icon(icon, color: color, size: 22),
    );
  }
}

/// Small badge showing delivery status.
/// Requirement 7.2: display delivery status.
class _DeliveryStatusBadge extends StatelessWidget {
  const _DeliveryStatusBadge({required this.status});

  final NotificationDeliveryStatus status;

  @override
  Widget build(BuildContext context) {
    final (Color bgColor, Color textColor) = switch (status) {
      NotificationDeliveryStatus.terkirim => (
          Colors.green.shade50,
          Colors.green.shade700
        ),
      NotificationDeliveryStatus.gagal => (
          Colors.red.shade50,
          Colors.red.shade700
        ),
      NotificationDeliveryStatus.pending => (
          Colors.orange.shade50,
          Colors.orange.shade700
        ),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        status.label,
        style: TextStyle(fontSize: 10, color: textColor),
      ),
    );
  }
}

/// Bottom sheet showing full notification details.
class _NotificationDetailSheet extends StatelessWidget {
  const _NotificationDetailSheet({required this.item});

  final NotificationItem item;

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.5,
      minChildSize: 0.3,
      maxChildSize: 0.85,
      expand: false,
      builder: (context, scrollController) {
        return SingleChildScrollView(
          controller: scrollController,
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Handle bar
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 16),
                  decoration: BoxDecoration(
                    color: Colors.grey.shade300,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),

              // Type badge
              Row(
                children: [
                  _TypeIcon(type: item.notificationType),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          item.notificationType.label,
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey.shade600,
                          ),
                        ),
                        const SizedBox(height: 2),
                        _DeliveryStatusBadge(status: item.statusPengiriman),
                      ],
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 16),

              // Title
              Text(
                item.judul,
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
              ),

              const SizedBox(height: 8),

              // Timestamp
              Text(
                _formatFullTimestamp(item.createdAt),
                style: TextStyle(
                  fontSize: 13,
                  color: Colors.grey.shade600,
                ),
              ),

              if (item.siswaName != null) ...[
                const SizedBox(height: 4),
                Text(
                  'Anak: ${item.siswaName}',
                  style: TextStyle(
                    fontSize: 13,
                    color: Colors.grey.shade600,
                  ),
                ),
              ],

              const Divider(height: 24),

              // Full message
              Text(
                item.pesan,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      height: 1.5,
                    ),
              ),
            ],
          ),
        );
      },
    );
  }

  String _formatFullTimestamp(DateTime dt) {
    final months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
      'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des',
    ];
    final day = dt.day.toString().padLeft(2, '0');
    final hour = dt.hour.toString().padLeft(2, '0');
    final minute = dt.minute.toString().padLeft(2, '0');
    return '$day ${months[dt.month - 1]} ${dt.year}, $hour:$minute';
  }
}
