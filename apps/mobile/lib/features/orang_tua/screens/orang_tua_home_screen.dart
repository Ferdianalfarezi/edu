import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/di/providers.dart';
import '../../../core/router/app_router.dart';
import '../../../core/theme/app_theme.dart';

/// Home screen for Orang Tua role.
///
/// Displays:
/// - Greeting with child summary
/// - Feature navigation cards
/// - Quick status overview
class OrangTuaHomeScreen extends ConsumerWidget {
  const OrangTuaHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authStateProvider);

    return Scaffold(
      body: SafeArea(
        child: CustomScrollView(
          slivers: [
            // Custom app bar
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Halo, ${authState.userName ?? 'Orang Tua'}',
                            style: Theme.of(context).textTheme.headlineSmall,
                          ),
                          const SizedBox(height: 2),
                          Text(
                            'Pantau perkembangan anak Anda',
                            style: Theme.of(context).textTheme.bodyMedium,
                          ),
                        ],
                      ),
                    ),
                    Row(
                      children: [
                        _IconBtn(
                          icon: Icons.notifications_outlined,
                          onTap: () => context.push(AppRoutes.orangTuaNotifications),
                        ),
                        const SizedBox(width: 8),
                        _IconBtn(
                          icon: Icons.logout_rounded,
                          onTap: () async {
                            await ref.read(authStateProvider.notifier).logout();
                          },
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),

            // Feature cards
            SliverPadding(
              padding: const EdgeInsets.all(20),
              sliver: SliverGrid.count(
                crossAxisCount: 2,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 1.15,
                children: [
                  _FeatureCard(
                    icon: Icons.calendar_today_rounded,
                    label: 'Absensi',
                    description: 'Kehadiran anak',
                    color: AppTheme.success,
                    onTap: () => context.push(AppRoutes.orangTuaAttendance),
                  ),
                  _FeatureCard(
                    icon: Icons.receipt_long_rounded,
                    label: 'Tagihan',
                    description: 'Pembayaran SPP',
                    color: AppTheme.primaryColor,
                    onTap: () => context.push(AppRoutes.orangTuaTagihan),
                  ),
                  _FeatureCard(
                    icon: Icons.school_rounded,
                    label: 'Rapor',
                    description: 'Nilai akademik',
                    color: AppTheme.warning,
                    onTap: () {
                      // TODO: Navigate to rapor
                    },
                  ),
                  _FeatureCard(
                    icon: Icons.notifications_active_rounded,
                    label: 'Notifikasi',
                    description: 'Pemberitahuan',
                    color: const Color(0xFF8B5CF6),
                    onTap: () => context.push(AppRoutes.orangTuaNotifications),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _IconBtn extends StatelessWidget {
  const _IconBtn({required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppTheme.surfaceBg,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Icon(icon, size: 20, color: AppTheme.textSecondary),
        ),
      ),
    );
  }
}

class _FeatureCard extends StatelessWidget {
  const _FeatureCard({
    required this.icon,
    required this.label,
    required this.description,
    required this.color,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final String description;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppTheme.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: color.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, size: 20, color: color),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: AppTheme.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    description,
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppTheme.textTertiary,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
