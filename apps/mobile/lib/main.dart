import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:firebase_core/firebase_core.dart';

import 'core/di/providers.dart';
import 'core/router/app_router.dart';
import 'core/services/in_app_notification_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Firebase.initializeApp();

  final container = ProviderContainer();

  // Initialize FCM notification handling
  await container.read(notificationServiceProvider).initialize();

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
      title: 'Edu School Management',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF1565C0),
        ),
        useMaterial3: true,
        appBarTheme: const AppBarTheme(
          centerTitle: true,
          elevation: 0,
        ),
      ),
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
