import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:logger/logger.dart';

import 'in_app_notification_service.dart';

/// Handles FCM push notification setup and token management.
///
/// Responsibilities:
/// - Request notification permissions
/// - Obtain and refresh FCM device token
/// - Handle foreground/background message callbacks
/// - Show in-app banners for foreground notifications
/// - Provide token to be registered with the backend
class NotificationService {
  NotificationService({
    FirebaseMessaging? messaging,
    this.onTokenRefresh,
    this.onMessageReceived,
    InAppNotificationService? inAppNotificationService,
  })  : _messaging = messaging ?? FirebaseMessaging.instance,
        _inAppNotificationService =
            inAppNotificationService ?? InAppNotificationService();

  final FirebaseMessaging _messaging;
  final Logger _logger = Logger();
  final InAppNotificationService _inAppNotificationService;

  /// Called when the FCM token is refreshed. Should re-register with backend.
  final void Function(String token)? onTokenRefresh;

  /// Called when a message is received in the foreground.
  final void Function(RemoteMessage message)? onMessageReceived;

  String? _currentToken;

  /// The current FCM device token.
  String? get currentToken => _currentToken;

  /// The in-app notification service for showing foreground banners.
  InAppNotificationService get inAppNotification => _inAppNotificationService;

  /// Initialize FCM: request permissions, get token, set up listeners.
  Future<void> initialize() async {
    // Request notification permissions (iOS requires explicit permission)
    final settings = await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
      provisional: false,
    );

    if (settings.authorizationStatus == AuthorizationStatus.denied) {
      _logger.w('Push notification permissions denied');
      return;
    }

    // Get current FCM token
    _currentToken = await _messaging.getToken();
    _logger.i('FCM Token obtained: ${_currentToken?.substring(0, 10)}...');

    // Listen for token refreshes
    _messaging.onTokenRefresh.listen((newToken) {
      _currentToken = newToken;
      _logger.i('FCM Token refreshed');
      onTokenRefresh?.call(newToken);
    });

    // Handle foreground messages — show in-app banner
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      _logger.d('Foreground message: ${message.notification?.title}');
      onMessageReceived?.call(message);

      // Show in-app banner for foreground notifications
      _inAppNotificationService.showNotificationBanner(message);
    });

    // Handle message opened app (background tap)
    FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
      _logger.d('Message opened app: ${message.data}');
      // Navigation handling will be done by the feature layer
    });
  }

  /// Get the current FCM token for backend registration.
  Future<String?> getToken() async {
    _currentToken ??= await _messaging.getToken();
    return _currentToken;
  }

  /// Subscribe to a topic (e.g., tenant-specific notifications).
  Future<void> subscribeToTopic(String topic) async {
    await _messaging.subscribeToTopic(topic);
  }

  /// Unsubscribe from a topic.
  Future<void> unsubscribeFromTopic(String topic) async {
    await _messaging.unsubscribeFromTopic(topic);
  }
}
