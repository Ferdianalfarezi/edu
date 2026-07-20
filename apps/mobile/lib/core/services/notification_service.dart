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
/// - Navigate to relevant screens when notification is tapped
/// - Provide token to be registered with the backend
class NotificationService {
  NotificationService({
    FirebaseMessaging? messaging,
    this.onTokenRefresh,
    this.onMessageReceived,
    this.onNotificationTap,
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

  /// Called when a notification is tapped (background or terminated).
  /// The data map contains the FCM data payload for navigation.
  final void Function(Map<String, dynamic> data)? onNotificationTap;

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

    _logger
        .i('Notification permission status: ${settings.authorizationStatus}');

    if (settings.authorizationStatus == AuthorizationStatus.denied) {
      _logger.w('Push notification permissions denied');
      return;
    }

    // On iOS, we need to wait for the APNs token before getting FCM token
    final apnsToken = await _messaging.getAPNSToken();
    _logger.i(
        'APNs token: ${apnsToken != null ? "obtained (${apnsToken.length} chars)" : "NULL - APNs not configured!"}');

    // Get current FCM token
    _currentToken = await _messaging.getToken();
    _logger.i(
        'FCM Token: ${_currentToken != null ? "${_currentToken!.substring(0, 10)}..." : "NULL"}');

    // Register initial token with the backend
    if (_currentToken != null) {
      onTokenRefresh?.call(_currentToken!);
    }

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
      _handleNotificationTap(message.data);
    });

    // Handle app opened from terminated state via notification tap
    final initialMessage = await _messaging.getInitialMessage();
    if (initialMessage != null) {
      _logger.d('App opened from terminated: ${initialMessage.data}');
      _handleNotificationTap(initialMessage.data);
    }
  }

  /// Process notification tap data and invoke the navigation callback.
  void _handleNotificationTap(Map<String, dynamic> data) {
    if (data.isNotEmpty) {
      onNotificationTap?.call(data);
    }
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
