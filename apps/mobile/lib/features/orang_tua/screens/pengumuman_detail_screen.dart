import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../models/pengumuman_models.dart';
import '../providers/pengumuman_provider.dart';

/// Detail screen for a single pengumuman (announcement).
///
/// Displays:
/// - Loading state: centered progress indicator
/// - Success state: judul, deskripsi (full text), nama sekolah, formatted date
/// - Error 403/404: "Pengumuman tidak tersedia" + back button
/// - Network error: "Gagal memuat pengumuman" + retry button
///
/// Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
class PengumumanDetailScreen extends ConsumerWidget {
  const PengumumanDetailScreen({
    super.key,
    required this.pengumumanId,
  });

  final String pengumumanId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detailAsync = ref.watch(pengumumanDetailProvider(pengumumanId));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Pengumuman'),
      ),
      body: detailAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, stack) => _buildErrorState(context, ref, error),
        data: (detail) => _PengumumanDetailBody(detail: detail),
      ),
    );
  }

  Widget _buildErrorState(BuildContext context, WidgetRef ref, Object error) {
    // Differentiate 403/404 from network errors
    if (error is DioException && error.response != null) {
      final statusCode = error.response!.statusCode;
      if (statusCode == 403 || statusCode == 404) {
        return Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.info_outline,
                  size: 48,
                  color: Colors.grey.shade400,
                ),
                const SizedBox(height: 12),
                Text(
                  'Pengumuman tidak tersedia',
                  style: Theme.of(context).textTheme.titleMedium,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 16),
                ElevatedButton.icon(
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.arrow_back),
                  label: const Text('Kembali'),
                ),
              ],
            ),
          ),
        );
      }
    }

    // Network error or other failures
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.wifi_off, size: 48, color: Colors.red),
            const SizedBox(height: 12),
            Text(
              'Gagal memuat pengumuman',
              style: Theme.of(context).textTheme.titleMedium,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () =>
                  ref.invalidate(pengumumanDetailProvider(pengumumanId)),
              child: const Text('Coba Lagi'),
            ),
          ],
        ),
      ),
    );
  }
}

/// Body content when pengumuman detail is successfully loaded.
class _PengumumanDetailBody extends StatelessWidget {
  const _PengumumanDetailBody({required this.detail});

  final PengumumanDetail detail;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final formattedDate =
        DateFormat('dd MMM yyyy, HH:mm').format(detail.createdAt);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Judul
          Text(
            detail.judul,
            style: theme.textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 12),

          // Metadata row: school name + date
          Row(
            children: [
              Icon(
                Icons.school_outlined,
                size: 16,
                color: Colors.grey.shade600,
              ),
              const SizedBox(width: 4),
              Expanded(
                child: Text(
                  detail.namaSekolah,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: Colors.grey.shade600,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              Icon(
                Icons.access_time,
                size: 16,
                color: Colors.grey.shade600,
              ),
              const SizedBox(width: 4),
              Text(
                formattedDate,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: Colors.grey.shade600,
                ),
              ),
            ],
          ),

          const Divider(height: 32),

          // Deskripsi (full text)
          Text(
            detail.deskripsi,
            style: theme.textTheme.bodyMedium?.copyWith(
              height: 1.6,
            ),
          ),

          const SizedBox(height: 24),
        ],
      ),
    );
  }
}
