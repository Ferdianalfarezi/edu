import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../di/providers.dart';
import '../models/auth_state.dart';
import '../models/user_role.dart';
import '../../features/auth/screens/forgot_password_screen.dart';
import '../../features/auth/screens/login_screen.dart';
import '../../features/auth/screens/splash_screen.dart';
import '../../features/guru/screens/guru_home_screen.dart';
import '../../features/guru/screens/guru_jadwal_screen.dart';
import '../../features/guru/screens/rpp_create_screen.dart';
import '../../features/guru/screens/rpp_detail_screen.dart';
import '../../features/guru/screens/rpp_favorites_screen.dart';
import '../../features/guru/screens/rpp_portal_screen.dart';
import '../../features/orang_tua/screens/attendance_screen.dart';
import '../../features/orang_tua/screens/notification_history_screen.dart';
import '../../features/orang_tua/screens/notification_preferences_screen.dart';
import '../../features/orang_tua/screens/orang_tua_home_screen.dart';
import '../../features/orang_tua/screens/payment_history_screen.dart';
import '../../features/orang_tua/screens/rapor_screen.dart';
import '../../features/orang_tua/screens/rapor_detail_screen.dart';
import '../../features/orang_tua/screens/tagihan_screen.dart';
import '../../features/orang_tua/screens/upload_bukti_screen.dart';
import '../../features/orang_tua/models/tagihan_models.dart';

/// Route paths.
class AppRoutes {
  AppRoutes._();

  static const String splash = '/';
  static const String login = '/login';
  static const String forgotPassword = '/forgot-password';
  static const String guruHome = '/guru';
  static const String guruJadwal = '/guru/jadwal';
  static const String guruRppPortal = '/guru/rpp';
  static const String guruRppCreate = '/guru/rpp/create';
  static const String guruRppDetail = '/guru/rpp/:rppId';
  static const String guruRppFavorites = '/guru/rpp/favorites';
  static const String orangTuaHome = '/orang-tua';
  static const String orangTuaAttendance = '/orang-tua/attendance';
  static const String orangTuaNotifications = '/orang-tua/notifications';
  static const String orangTuaNotificationPreferences =
      '/orang-tua/notifications/preferences';
  static const String orangTuaRapor = '/orang-tua/rapor';
  static const String orangTuaRaporDetail = '/orang-tua/rapor/:siswaId/:periodeId';
  static const String orangTuaTagihan = '/orang-tua/tagihan';
  static const String orangTuaUploadBukti = '/orang-tua/tagihan/upload-bukti';
  static const String orangTuaPaymentHistory = '/orang-tua/tagihan/history';
}

/// GoRouter configuration with role-based redirect logic.
///
/// After login, the user is routed to either:
/// - Guru UI (/guru/*) if role is guru
/// - Orang Tua UI (/orang-tua/*) if role is orang_tua
///
/// Unauthenticated users are redirected to login.
/// Requirement 19.11: detect role from auth response and show appropriate UI.
final appRouterProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authStateProvider);

  return GoRouter(
    initialLocation: AppRoutes.splash,
    refreshListenable: _AuthChangeNotifier(ref),
    redirect: (BuildContext context, GoRouterState state) {
      final isAuthenticated = authState.isAuthenticated;
      final currentPath = state.matchedLocation;

      // Allow splash screen to handle session restoration
      if (currentPath == AppRoutes.splash) {
        return null;
      }

      // Not authenticated → redirect to login (allow forgot-password too)
      if (!isAuthenticated) {
        if (currentPath == AppRoutes.login ||
            currentPath == AppRoutes.forgotPassword) {
          return null;
        }
        return AppRoutes.login;
      }

      // Authenticated → redirect from login/forgotPassword to appropriate home
      if (currentPath == AppRoutes.login ||
          currentPath == AppRoutes.forgotPassword) {
        return _homeRouteForRole(authState.role);
      }

      // Prevent guru from accessing orang_tua routes and vice versa
      if (authState.role == UserRole.guru &&
          currentPath.startsWith(AppRoutes.orangTuaHome)) {
        return AppRoutes.guruHome;
      }
      if (authState.role == UserRole.orangTua &&
          currentPath.startsWith(AppRoutes.guruHome)) {
        return AppRoutes.orangTuaHome;
      }

      return null;
    },
    routes: [
      GoRoute(
        path: AppRoutes.splash,
        builder: (context, state) => const SplashScreen(),
      ),
      GoRoute(
        path: AppRoutes.login,
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: AppRoutes.forgotPassword,
        builder: (context, state) => const ForgotPasswordScreen(),
      ),

      // Guru routes
      ShellRoute(
        builder: (context, state, child) => child,
        routes: [
          GoRoute(
            path: AppRoutes.guruHome,
            builder: (context, state) => const GuruHomeScreen(),
          ),
          GoRoute(
            path: AppRoutes.guruJadwal,
            builder: (context, state) => const GuruJadwalScreen(),
          ),
          GoRoute(
            path: AppRoutes.guruRppPortal,
            builder: (context, state) => const RppPortalScreen(),
          ),
          GoRoute(
            path: AppRoutes.guruRppCreate,
            builder: (context, state) => const RppCreateScreen(),
          ),
          GoRoute(
            path: AppRoutes.guruRppFavorites,
            builder: (context, state) => const RppFavoritesScreen(),
          ),
          GoRoute(
            path: AppRoutes.guruRppDetail,
            builder: (context, state) {
              final rppId = state.pathParameters['rppId']!;
              return RppDetailScreen(rppId: rppId);
            },
          ),
        ],
      ),

      // Orang Tua routes
      ShellRoute(
        builder: (context, state, child) => child,
        routes: [
          GoRoute(
            path: AppRoutes.orangTuaHome,
            builder: (context, state) => const OrangTuaHomeScreen(),
          ),
          GoRoute(
            path: AppRoutes.orangTuaAttendance,
            builder: (context, state) => const AttendanceScreen(),
          ),
          GoRoute(
            path: AppRoutes.orangTuaNotifications,
            builder: (context, state) => const NotificationHistoryScreen(),
          ),
          GoRoute(
            path: AppRoutes.orangTuaNotificationPreferences,
            builder: (context, state) =>
                const NotificationPreferencesScreen(),
          ),
          GoRoute(
            path: AppRoutes.orangTuaRapor,
            builder: (context, state) => const RaporScreen(),
          ),
          GoRoute(
            path: AppRoutes.orangTuaRaporDetail,
            builder: (context, state) {
              final siswaId = state.pathParameters['siswaId']!;
              final periodeId = state.pathParameters['periodeId']!;
              return RaporDetailScreen(
                siswaId: siswaId,
                periodeId: periodeId,
              );
            },
          ),
          GoRoute(
            path: AppRoutes.orangTuaTagihan,
            builder: (context, state) => const TagihanScreen(),
          ),
          GoRoute(
            path: AppRoutes.orangTuaUploadBukti,
            builder: (context, state) {
              final tagihan = state.extra as Tagihan;
              return UploadBuktiScreen(tagihan: tagihan);
            },
          ),
          GoRoute(
            path: AppRoutes.orangTuaPaymentHistory,
            builder: (context, state) {
              final tagihan = state.extra as Tagihan;
              return PaymentHistoryScreen(tagihan: tagihan);
            },
          ),
        ],
      ),
    ],
  );
});

/// Determine the home route based on user role.
String _homeRouteForRole(UserRole? role) {
  switch (role) {
    case UserRole.guru:
      return AppRoutes.guruHome;
    case UserRole.orangTua:
      return AppRoutes.orangTuaHome;
    case null:
      return AppRoutes.login;
  }
}

/// Notifier that triggers GoRouter refresh when auth state changes.
class _AuthChangeNotifier extends ChangeNotifier {
  _AuthChangeNotifier(this._ref) {
    _ref.listen<AuthState>(authStateProvider, (previous, next) {
      notifyListeners();
    });
  }

  final Ref _ref;
}
