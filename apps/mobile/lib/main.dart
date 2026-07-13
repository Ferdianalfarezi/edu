import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'core/di/providers.dart';
import 'core/router/app_router.dart';
import 'core/services/in_app_notification_service.dart';
import 'core/theme/app_theme.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize locale data for intl (date/currency formatting)
  await initializeDateFormatting('id_ID', null);

  // Set system UI overlay style for a clean look
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.dark,
    systemNavigationBarColor: Colors.white,
    systemNavigationBarIconBrightness: Brightness.dark,
  ));

  try {
    await Firebase.initializeApp();
  } catch (e) {
    // Firebase not configured — skip initialization for local development
    debugPrint('Firebase init skipped: $e');
  }

  final container = ProviderContainer();

  // Initialize FCM notification handling
  try {
    await container.read(notificationServiceProvider).initialize();
  } catch (e) {
    debugPrint('Notification service init skipped: $e');
  }

  runApp(
    UncontrolledProviderScope(
      container: container,
      child: const EduApp(),
    ),
  );
}

class EduApp extends ConsumerWidget {
  const EduApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(appRouterProvider);

    return MaterialApp.router(
      title: 'Teman Sekolah',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      routerConfig: router,
      builder: (context, child) {
        // Wrap with Overlay support for in-app notification banners
        return Navigator(
          key: InAppNotificationService.navigatorKey,
          onGenerateRoute: (_) => MaterialPageRoute(
            builder: (_) => child ?? const SizedBox.shrink(),
          ),
        );
      },
    );
  }
}
