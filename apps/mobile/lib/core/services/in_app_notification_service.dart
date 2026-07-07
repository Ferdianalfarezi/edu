import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';

/// Service that displays in-app banners when push notifications arrive
/// while the app is in the foreground.
///
/// This ensures the user sees notification content without leaving
/// the current screen.
///
/// Usage: Call [showNotificationBanner] with a navigator key to display
/// an overlay banner at the top of the screen.
class InAppNotificationService {
  InAppNotificationService({this.onNotificationTapped});

  /// Callback when user taps the notification banner.
  final void Function(RemoteMessage message)? onNotificationTapped;

  /// Global key for accessing the navigator overlay.
  static final GlobalKey<NavigatorState> navigatorKey =
      GlobalKey<NavigatorState>();

  OverlayEntry? _currentBanner;

  /// Show a foreground notification as an in-app banner.
  ///
  /// Displays at the top of the screen with auto-dismiss after 4 seconds.
  /// User can tap to navigate to the relevant screen or swipe to dismiss.
  void showNotificationBanner(RemoteMessage message) {
    final context = navigatorKey.currentContext;
    if (context == null) return;

    final overlay = Overlay.of(context);

    // Remove existing banner if any
    _dismissBanner();

    _currentBanner = OverlayEntry(
      builder: (context) => _NotificationBanner(
        title: message.notification?.title ?? 'Notifikasi',
        body: message.notification?.body ?? '',
        type: message.data['type'] as String?,
        onTap: () {
          _dismissBanner();
          onNotificationTapped?.call(message);
        },
        onDismiss: _dismissBanner,
      ),
    );

    overlay.insert(_currentBanner!);

    // Auto-dismiss after 4 seconds
    Future.delayed(const Duration(seconds: 4), _dismissBanner);
  }

  void _dismissBanner() {
    _currentBanner?.remove();
    _currentBanner = null;
  }
}

/// Animated in-app notification banner widget.
class _NotificationBanner extends StatefulWidget {
  const _NotificationBanner({
    required this.title,
    required this.body,
    this.type,
    required this.onTap,
    required this.onDismiss,
  });

  final String title;
  final String body;
  final String? type;
  final VoidCallback onTap;
  final VoidCallback onDismiss;

  @override
  State<_NotificationBanner> createState() => _NotificationBannerState();
}

class _NotificationBannerState extends State<_NotificationBanner>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<Offset> _slideAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 300),
      vsync: this,
    );
    _slideAnimation = Tween<Offset>(
      begin: const Offset(0, -1),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: _controller, curve: Curves.easeOut));

    _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  IconData _iconForType(String? type) {
    switch (type) {
      case 'kehadiran':
        return Icons.check_circle;
      case 'ketidakhadiran':
        return Icons.cancel;
      case 'tagihan':
      case 'tagihan_baru':
      case 'tagihan_jatuh_tempo':
        return Icons.receipt_long;
      case 'verifikasi':
        return Icons.verified;
      case 'rapor':
      case 'rapor_final':
        return Icons.school;
      default:
        return Icons.notifications;
    }
  }

  @override
  Widget build(BuildContext context) {
    final topPadding = MediaQuery.of(context).padding.top;

    return Positioned(
      top: 0,
      left: 0,
      right: 0,
      child: SlideTransition(
        position: _slideAnimation,
        child: GestureDetector(
          onTap: widget.onTap,
          onVerticalDragEnd: (details) {
            if (details.velocity.pixelsPerSecond.dy < -100) {
              widget.onDismiss();
            }
          },
          child: Material(
            elevation: 4,
            color: Colors.transparent,
            child: Container(
              padding: EdgeInsets.only(
                top: topPadding + 8,
                left: 16,
                right: 16,
                bottom: 12,
              ),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surface,
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.1),
                    blurRadius: 8,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: Row(
                children: [
                  Icon(
                    _iconForType(widget.type),
                    color: Theme.of(context).colorScheme.primary,
                    size: 24,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          widget.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 14,
                          ),
                        ),
                        if (widget.body.isNotEmpty) ...[
                          const SizedBox(height: 2),
                          Text(
                            widget.body,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey.shade700,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, size: 18),
                    onPressed: widget.onDismiss,
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(
                      minWidth: 32,
                      minHeight: 32,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
