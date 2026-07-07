import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/connectivity_service.dart';

/// A banner widget that shows online/offline status.
///
/// Displays an orange banner when offline, hidden when online.
/// Per Requirement 26.4: show connectivity indicator on attendance pages.
class ConnectivityBanner extends ConsumerWidget {
  const ConnectivityBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final connectivityAsync = ref.watch(connectivityStreamProvider);

    return connectivityAsync.when(
      data: (isOnline) {
        if (isOnline) return const SizedBox.shrink();

        return Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
          color: Colors.orange.shade100,
          child: Row(
            children: [
              Icon(Icons.wifi_off, size: 16, color: Colors.orange.shade800),
              const SizedBox(width: 8),
              Text(
                'Mode Offline',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: Colors.orange.shade800,
                ),
              ),
            ],
          ),
        );
      },
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
    );
  }
}
