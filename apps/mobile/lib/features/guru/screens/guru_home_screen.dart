import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/di/providers.dart';
import '../../../core/network/connectivity_service.dart';
import '../../../core/router/app_router.dart';
import '../models/jadwal_item.dart';
import '../models/sync_result.dart';
import '../providers/attendance_provider.dart';
import '../services/attendance_sync_service.dart';
import 'attendance_input_screen.dart';
import 'guru_jadwal_screen.dart';

/// Home screen for Guru role.
///
/// Displays:
/// - Online/offline banner indicator (Req 26.4)
/// - Sync queue indicator with pending count (Req 26.5)
/// - Today's scheduled classes for attendance input
/// - Clock skew warning if device clock differs >5 min from server
class GuruHomeScreen extends ConsumerStatefulWidget {
  const GuruHomeScreen({super.key});

  @override
  ConsumerState<GuruHomeScreen> createState() => _GuruHomeScreenState();
}

class _GuruHomeScreenState extends ConsumerState<GuruHomeScreen>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Check clock skew on init
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _checkClockSkew();
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Trigger sync when app comes to foreground
    if (state == AppLifecycleState.resumed) {
      ref.read(attendanceSyncServiceProvider.notifier).syncPendingRecords();
    }
  }

  Future<void> _checkClockSkew() async {
    final syncService = ref.read(attendanceSyncServiceProvider.notifier);
    await syncService.checkClockSkew();
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authStateProvider);
    final connectivityAsync = ref.watch(connectivityStreamProvider);
    final syncStatus = ref.watch(attendanceSyncServiceProvider);
    final jadwalAsync = ref.watch(todayJadwalProvider);
    final syncService = ref.read(attendanceSyncServiceProvider.notifier);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Beranda Guru'),
        actions: [
          // Sync queue indicator
          if (syncStatus.pendingCount > 0)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: _SyncQueueBadge(
                pendingCount: syncStatus.pendingCount,
                isSyncing: syncStatus.isSyncing,
                onTap: () => _showSyncDetails(context, syncStatus),
              ),
            ),
          IconButton(
            icon: const Icon(Icons.calendar_month),
            tooltip: 'Jadwal Mengajar',
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => const GuruJadwalScreen(),
                ),
              );
            },
          ),
          IconButton(
            icon: const Icon(Icons.description),
            tooltip: 'Portal RPP',
            onPressed: () => context.push(AppRoutes.guruRppPortal),
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () async {
              await ref.read(authStateProvider.notifier).logout();
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(todayJadwalProvider);
          await syncService.syncPendingRecords();
        },
        child: Column(
          children: [
            // Online/offline banner
            _ConnectivityBanner(connectivityAsync: connectivityAsync),

            // Clock skew warning
            if (syncService.clockSkew.hasWarning)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(
                  vertical: 8,
                  horizontal: 16,
                ),
                color: Colors.red.shade50,
                child: Row(
                  children: [
                    Icon(Icons.access_time, size: 16, color: Colors.red.shade700),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Peringatan: Jam perangkat berbeda ${(syncService.clockSkew.skewSeconds / 60).round()} menit dari server. '
                        'Harap perbaiki jam perangkat.',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.red.shade700,
                        ),
                      ),
                    ),
                  ],
                ),
              ),

            // Sync result notification (conflicts)
            if (syncStatus.lastSyncResult != null &&
                syncStatus.lastSyncResult!.conflicts.isNotEmpty)
              _ConflictBanner(syncResult: syncStatus.lastSyncResult!),

            // Main content
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Selamat datang, ${authState.userName ?? 'Guru'}',
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    const SizedBox(height: 24),
                    const Text(
                      'Kelas Hari Ini',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Today's jadwal list
                    Expanded(
                      child: jadwalAsync.when(
                        data: (items) => _JadwalList(
                          items: items,
                          onTap: (item) => _openAttendanceInput(context, item),
                        ),
                        loading: () => const Center(
                          child: CircularProgressIndicator(),
                        ),
                        error: (error, _) => Center(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.error_outline, size: 48,
                                  color: Colors.grey),
                              const SizedBox(height: 8),
                              Text(
                                'Gagal memuat jadwal',
                                style: TextStyle(color: Colors.grey.shade600),
                              ),
                              const SizedBox(height: 8),
                              TextButton(
                                onPressed: () =>
                                    ref.invalidate(todayJadwalProvider),
                                child: const Text('Coba Lagi'),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _openAttendanceInput(BuildContext context, JadwalItem item) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => AttendanceInputScreen(jadwalItem: item),
      ),
    );
  }

  void _showSyncDetails(BuildContext context, SyncStatus status) {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => _SyncDetailsSheet(syncStatus: status),
    );
  }
}

/// Connectivity banner showing online/offline status.
class _ConnectivityBanner extends StatelessWidget {
  const _ConnectivityBanner({required this.connectivityAsync});

  final AsyncValue<bool> connectivityAsync;

  @override
  Widget build(BuildContext context) {
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
                'Mode Offline — data akan disinkronisasi saat online',
                style: TextStyle(
                  fontSize: 13,
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

/// Badge showing pending sync count in the app bar.
class _SyncQueueBadge extends StatelessWidget {
  const _SyncQueueBadge({
    required this.pendingCount,
    required this.isSyncing,
    required this.onTap,
  });

  final int pendingCount;
  final bool isSyncing;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Stack(
        alignment: Alignment.center,
        children: [
          if (isSyncing)
            const SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          else
            const Icon(Icons.sync),
          Positioned(
            top: 0,
            right: 0,
            child: Container(
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(
                color: Colors.red,
                borderRadius: BorderRadius.circular(10),
              ),
              constraints: const BoxConstraints(minWidth: 18, minHeight: 18),
              child: Text(
                '$pendingCount',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 10,
                  fontWeight: FontWeight.bold,
                ),
                textAlign: TextAlign.center,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Banner showing conflict results from sync (teacher informed when overridden).
class _ConflictBanner extends StatelessWidget {
  const _ConflictBanner({required this.syncResult});

  final SyncResult syncResult;

  @override
  Widget build(BuildContext context) {
    final overridden = syncResult.conflicts
        .where((c) => c.winner == 'server')
        .toList();

    if (overridden.isEmpty) return const SizedBox.shrink();

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
      color: Colors.amber.shade50,
      child: Row(
        children: [
          Icon(Icons.info_outline, size: 16, color: Colors.amber.shade800),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              '${overridden.length} data absensi Anda diganti oleh server. '
              'Ketuk untuk detail.',
              style: TextStyle(
                fontSize: 12,
                color: Colors.amber.shade900,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Today's jadwal list widget.
class _JadwalList extends StatelessWidget {
  const _JadwalList({
    required this.items,
    required this.onTap,
  });

  final List<JadwalItem> items;
  final void Function(JadwalItem) onTap;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.event_busy, size: 48, color: Colors.grey),
            SizedBox(height: 8),
            Text(
              'Tidak ada kelas terjadwal untuk hari ini',
              style: TextStyle(color: Colors.grey, fontSize: 15),
            ),
          ],
        ),
      );
    }

    return ListView.separated(
      itemCount: items.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (context, index) {
        final item = items[index];
        return _JadwalCard(item: item, onTap: () => onTap(item));
      },
    );
  }
}

/// Card displaying a single jadwal item.
class _JadwalCard extends StatelessWidget {
  const _JadwalCard({required this.item, required this.onTap});

  final JadwalItem item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 1,
      margin: EdgeInsets.zero,
      child: ListTile(
        onTap: onTap,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 8,
        ),
        leading: Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            color: Theme.of(context).primaryColor.withOpacity(0.1),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(
            Icons.class_,
            color: Theme.of(context).primaryColor,
          ),
        ),
        title: Text(
          item.kelasNama,
          style: const TextStyle(fontWeight: FontWeight.w600),
        ),
        subtitle: Text(item.mataPelajaranNama),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              '${item.jamMulai} - ${item.jamSelesai}',
              style: TextStyle(
                fontSize: 13,
                color: Colors.grey.shade600,
              ),
            ),
            const SizedBox(height: 4),
            const Icon(Icons.chevron_right, size: 20),
          ],
        ),
      ),
    );
  }
}

/// Bottom sheet showing sync queue details.
class _SyncDetailsSheet extends StatelessWidget {
  const _SyncDetailsSheet({required this.syncStatus});

  final SyncStatus syncStatus;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Antrian Sinkronisasi',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
              ),
              if (syncStatus.isSyncing)
                const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
            ],
          ),
          const SizedBox(height: 16),
          _DetailRow(
            label: 'Menunggu sinkronisasi',
            value: '${syncStatus.pendingCount} data',
          ),
          if (syncStatus.isSyncing)
            const _DetailRow(
              label: 'Status',
              value: 'Sedang menyinkronkan...',
            ),
          if (syncStatus.lastError != null) ...[
            const SizedBox(height: 8),
            Text(
              syncStatus.lastError!,
              style: TextStyle(color: Colors.red.shade700, fontSize: 13),
            ),
          ],
          if (syncStatus.lastSyncResult != null) ...[
            const SizedBox(height: 12),
            Text(
              'Sinkronisasi terakhir:',
              style: TextStyle(
                fontSize: 13,
                color: Colors.grey.shade600,
              ),
            ),
            const SizedBox(height: 4),
            _DetailRow(
              label: 'Berhasil',
              value: '${syncStatus.lastSyncResult!.synced.length} data',
            ),
            if (syncStatus.lastSyncResult!.conflicts.isNotEmpty) ...[
              _DetailRow(
                label: 'Konflik',
                value: '${syncStatus.lastSyncResult!.conflicts.length} data',
              ),
              const SizedBox(height: 8),
              ...syncStatus.lastSyncResult!.conflicts.map((conflict) {
                return Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Text(
                    '• ${conflict.reasonDisplay}',
                    style: TextStyle(
                      fontSize: 12,
                      color: conflict.winner == 'server'
                          ? Colors.orange.shade800
                          : Colors.green.shade700,
                    ),
                  ),
                );
              }),
            ],
          ],
          const SizedBox(height: 16),
        ],
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(fontSize: 14)),
          Text(
            value,
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
          ),
        ],
      ),
    );
  }
}
