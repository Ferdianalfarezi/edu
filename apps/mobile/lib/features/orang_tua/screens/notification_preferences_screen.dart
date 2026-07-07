import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/notification_models.dart';
import '../providers/notification_provider.dart';

/// Notification preferences screen.
///
/// Features:
/// - Per-child section (for multi-child parents)
/// - Toggle switches: kehadiran ON/OFF, ketidakhadiran ON/OFF
/// - Auto-save on toggle change
///
/// Requirements: 25.1–25.4
class NotificationPreferencesScreen extends ConsumerWidget {
  const NotificationPreferencesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(notificationPreferencesProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Pengaturan Notifikasi'),
      ),
      body: _buildBody(context, ref, state),
    );
  }

  Widget _buildBody(
    BuildContext context,
    WidgetRef ref,
    NotificationPreferencesState state,
  ) {
    if (state.isLoading && state.preferences.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    if (state.error != null && state.preferences.isEmpty) {
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
                onPressed: () => ref
                    .read(notificationPreferencesProvider.notifier)
                    .fetchPreferences(),
                child: const Text('Coba Lagi'),
              ),
            ],
          ),
        ),
      );
    }

    if (state.preferences.isEmpty) {
      return const Center(
        child: Text('Tidak ada data anak yang terdaftar.'),
      );
    }

    return ListView(
      padding: const EdgeInsets.symmetric(vertical: 12),
      children: [
        // Explanation header
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Text(
            'Atur notifikasi yang ingin Anda terima untuk setiap anak.',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Colors.grey.shade600,
                ),
          ),
        ),
        const SizedBox(height: 8),

        // Per-child preference cards (Requirement 25.4)
        ...state.preferences.map((pref) => _ChildPreferenceCard(
              preference: pref,
              isUpdating: state.updatingChildId == pref.siswaId,
              onKehadiranChanged: (enabled) {
                ref
                    .read(notificationPreferencesProvider.notifier)
                    .toggleKehadiran(pref.siswaId, enabled);
              },
              onKetidakhadiranChanged: (enabled) {
                ref
                    .read(notificationPreferencesProvider.notifier)
                    .toggleKetidakhadiran(pref.siswaId, enabled);
              },
            )),
      ],
    );
  }
}

/// Card displaying preference toggles for one child.
class _ChildPreferenceCard extends StatelessWidget {
  const _ChildPreferenceCard({
    required this.preference,
    required this.isUpdating,
    required this.onKehadiranChanged,
    required this.onKetidakhadiranChanged,
  });

  final ChildNotificationPreference preference;
  final bool isUpdating;
  final ValueChanged<bool> onKehadiranChanged;
  final ValueChanged<bool> onKetidakhadiranChanged;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      elevation: 1,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Child info header
            Row(
              children: [
                CircleAvatar(
                  radius: 18,
                  backgroundColor:
                      Theme.of(context).colorScheme.primaryContainer,
                  child: Text(
                    preference.siswaName.isNotEmpty
                        ? preference.siswaName[0].toUpperCase()
                        : '?',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      color: Theme.of(context).colorScheme.onPrimaryContainer,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        preference.siswaName,
                        style: const TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 15,
                        ),
                      ),
                      if (preference.kelasNama.isNotEmpty)
                        Text(
                          preference.kelasNama,
                          style: TextStyle(
                            fontSize: 13,
                            color: Colors.grey.shade600,
                          ),
                        ),
                    ],
                  ),
                ),
                if (isUpdating)
                  const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
              ],
            ),

            const Divider(height: 24),

            // Kehadiran toggle (Requirement 25.1: toggle kehadiran ON/OFF)
            _PreferenceToggle(
              title: 'Notifikasi Kehadiran',
              subtitle: 'Terima notifikasi saat anak hadir di sekolah',
              value: preference.kehadiranEnabled,
              onChanged: onKehadiranChanged,
            ),

            const SizedBox(height: 8),

            // Ketidakhadiran toggle (Requirement 25.1: toggle ketidakhadiran ON/OFF)
            _PreferenceToggle(
              title: 'Notifikasi Ketidakhadiran',
              subtitle:
                  'Terima notifikasi saat anak izin, sakit, atau alpa',
              value: preference.ketidakhadiranEnabled,
              onChanged: onKetidakhadiranChanged,
            ),
          ],
        ),
      ),
    );
  }
}

/// Reusable toggle row for a single preference.
class _PreferenceToggle extends StatelessWidget {
  const _PreferenceToggle({
    required this.title,
    required this.subtitle,
    required this.value,
    required this.onChanged,
  });

  final String title;
  final String subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontWeight: FontWeight.w500,
                  fontSize: 14,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                subtitle,
                style: TextStyle(
                  fontSize: 12,
                  color: Colors.grey.shade600,
                ),
              ),
            ],
          ),
        ),
        Switch.adaptive(
          value: value,
          onChanged: onChanged,
        ),
      ],
    );
  }
}
