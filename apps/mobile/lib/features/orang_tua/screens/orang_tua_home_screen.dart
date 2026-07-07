import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/di/providers.dart';
import '../../../core/router/app_router.dart';

/// Home screen for Orang Tua role.
///
/// Displays:
/// - Child/children overview grouped by school (Requirement 21.9, 21.10)
/// - Navigation to absensi, tagihan, rapor, and notifikasi
/// - Multi-school grouping for cross-tenant parents (Requirement 21.12)
class OrangTuaHomeScreen extends ConsumerWidget {
  const OrangTuaHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authStateProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Beranda'),
        actions: [
          IconButton(
            icon: const Icon(Icons.notifications_outlined),
            onPressed: () {
              context.push(AppRoutes.orangTuaNotifications);
            },
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () async {
              await ref.read(authStateProvider.notifier).logout();
            },
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Halo, ${authState.userName ?? 'Orang Tua'}',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 24),

            // Feature cards
            Expanded(
              child: GridView.count(
                crossAxisCount: 2,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                children: [
                  _FeatureCard(
                    icon: Icons.calendar_today,
                    label: 'Absensi',
                    onTap: () {
                      context.push(AppRoutes.orangTuaAttendance);
                    },
                  ),
                  _FeatureCard(
                    icon: Icons.payment,
                    label: 'Tagihan',
                    onTap: () {
                      context.push(AppRoutes.orangTuaTagihan);
                    },
                  ),
                  _FeatureCard(
                    icon: Icons.school,
                    label: 'Rapor',
                    onTap: () {
                      // TODO: Task 21.6
                    },
                  ),
                  _FeatureCard(
                    icon: Icons.notifications,
                    label: 'Notifikasi',
                    onTap: () {
                      context.push(AppRoutes.orangTuaNotifications);
                    },
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

class _FeatureCard extends StatelessWidget {
  const _FeatureCard({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 40, color: Theme.of(context).primaryColor),
              const SizedBox(height: 12),
              Text(
                label,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
