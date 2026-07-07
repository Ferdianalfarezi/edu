import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/di/providers.dart';
import '../../../core/models/user_role.dart';
import '../../../core/router/app_router.dart';

/// Splash screen that attempts to restore a previous session.
///
/// On app launch:
/// 1. Show loading indicator
/// 2. Try to restore session from stored tokens
/// 3. Route to appropriate screen based on result
class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> {
  @override
  void initState() {
    super.initState();
    _restoreSession();
  }

  Future<void> _restoreSession() async {
    final authNotifier = ref.read(authStateProvider.notifier);
    await authNotifier.restoreSession();

    if (!mounted) return;

    final authState = ref.read(authStateProvider);

    if (authState.isAuthenticated) {
      switch (authState.role) {
        case UserRole.guru:
          context.go(AppRoutes.guruHome);
        case UserRole.orangTua:
          context.go(AppRoutes.orangTuaHome);
        case null:
          context.go(AppRoutes.login);
      }
    } else {
      context.go(AppRoutes.login);
    }
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.school_rounded,
              size: 80,
              color: Color(0xFF1565C0),
            ),
            SizedBox(height: 24),
            Text(
              'Edu School',
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
                color: Color(0xFF1565C0),
              ),
            ),
            SizedBox(height: 32),
            CircularProgressIndicator(),
          ],
        ),
      ),
    );
  }
}
