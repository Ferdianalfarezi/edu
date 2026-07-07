import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/di/providers.dart';
import '../models/rpp_models.dart';
import '../providers/rpp_provider.dart';

/// Detail screen for viewing a single RPP.
///
/// Requirements: 43.4, 43.5, 44.1, 44.2
/// - Shows full RPP metadata + content (43.4)
/// - Download button for published RPP (43.5)
/// - Favorite toggle (44.1, 44.2)
/// - Edit/delete controls for the RPP owner
class RppDetailScreen extends ConsumerWidget {
  const RppDetailScreen({super.key, required this.rppId});

  final String rppId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detailAsync = ref.watch(rppDetailProvider(rppId));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Detail RPP'),
        actions: [
          detailAsync.whenOrNull(
                data: (detail) {
                  final favoriteNotifier =
                      ref.watch(rppFavoriteNotifierProvider.notifier);
                  final isFavorited = favoriteNotifier.isFavorited(
                    rppId,
                    serverState: detail.isFavorited,
                  );

                  return IconButton(
                    icon: Icon(
                      isFavorited ? Icons.star : Icons.star_border,
                      color: isFavorited ? Colors.amber : null,
                    ),
                    tooltip:
                        isFavorited ? 'Hapus dari favorit' : 'Tambah ke favorit',
                    onPressed: () {
                      favoriteNotifier.toggleFavorite(
                        rppId,
                        currentState: isFavorited,
                      );
                    },
                  );
                },
              ) ??
              const SizedBox.shrink(),
        ],
      ),
      body: detailAsync.when(
        data: (detail) => _DetailContent(detail: detail),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, size: 48, color: Colors.grey),
              const SizedBox(height: 8),
              Text(
                'Gagal memuat RPP',
                style: TextStyle(color: Colors.grey.shade600),
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => ref.invalidate(rppDetailProvider(rppId)),
                child: const Text('Coba Lagi'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DetailContent extends ConsumerWidget {
  const _DetailContent({required this.detail});

  final RppDetail detail;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authStateProvider);
    final isOwner = authState.userId == detail.guruId;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Title
          Text(
            detail.judul,
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
          ),
          const SizedBox(height: 12),

          // Status badge
          Row(
            children: [
              _StatusBadge(status: detail.status),
              const SizedBox(width: 8),
              _ContentTypeBadge(kontenType: detail.kontenType),
            ],
          ),
          const SizedBox(height: 16),

          // Metadata section
          _MetadataCard(detail: detail),
          const SizedBox(height: 16),

          // Content section
          if (detail.kontenType == 'richtext' && detail.konten != null) ...[
            const Text(
              'Isi RPP',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                border: Border.all(color: Colors.grey.shade200),
                borderRadius: BorderRadius.circular(8),
                color: Colors.grey.shade50,
              ),
              child: SelectableText(
                detail.konten!,
                style: const TextStyle(fontSize: 14, height: 1.6),
              ),
            ),
          ],

          // File info for file-based RPP
          if (detail.kontenType == 'file') ...[
            const Text(
              'File Terlampir',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                border: Border.all(color: Colors.blue.shade100),
                borderRadius: BorderRadius.circular(8),
                color: Colors.blue.shade50,
              ),
              child: Row(
                children: [
                  Icon(Icons.insert_drive_file,
                      color: Colors.blue.shade700, size: 32),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          detail.fileNama ?? 'File RPP',
                          style: const TextStyle(fontWeight: FontWeight.w500),
                        ),
                        if (detail.fileSize != null)
                          Text(
                            _formatFileSize(detail.fileSize!),
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey.shade600,
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],

          const SizedBox(height: 24),

          // Download button (Req 43.5)
          if (detail.status == 'published')
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: () => _downloadRpp(context, ref),
                icon: const Icon(Icons.download),
                label: const Text('Download RPP'),
              ),
            ),

          // Owner actions
          if (isOwner) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () {
                      // Navigate to edit screen (future task)
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Fitur edit RPP')),
                      );
                    },
                    icon: const Icon(Icons.edit),
                    label: const Text('Edit'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _confirmDelete(context, ref),
                    icon: const Icon(Icons.delete_outline, color: Colors.red),
                    label: const Text(
                      'Hapus',
                      style: TextStyle(color: Colors.red),
                    ),
                    style: OutlinedButton.styleFrom(
                      side: const BorderSide(color: Colors.red),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _downloadRpp(BuildContext context, WidgetRef ref) async {
    try {
      final url = await getRppDownloadUrl(ref: ref, rppId: detail.id);
      // In production, use url_launcher to open the presigned URL
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Download URL: $url')),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Gagal mendapatkan link download: $e')),
      );
    }
  }

  Future<void> _confirmDelete(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Hapus RPP'),
        content: const Text(
          'Apakah Anda yakin ingin menghapus RPP ini? '
          'Tindakan ini tidak dapat dibatalkan.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Batal'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Hapus'),
          ),
        ],
      ),
    );

    if (confirmed == true && context.mounted) {
      try {
        final apiClient = ref.read(apiClientProvider);
        await apiClient.dio.delete('/rpp/${detail.id}');
        ref.invalidate(rppListProvider);
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('RPP berhasil dihapus')),
          );
          context.pop();
        }
      } catch (e) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Gagal menghapus RPP: $e')),
          );
        }
      }
    }
  }

  String _formatFileSize(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
}

/// Metadata card showing RPP info.
class _MetadataCard extends StatelessWidget {
  const _MetadataCard({required this.detail});

  final RppDetail detail;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.grey.shade50,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            _MetadataRow(
              icon: Icons.person,
              label: 'Guru',
              value: detail.guruNama,
            ),
            const Divider(height: 16),
            _MetadataRow(
              icon: Icons.book,
              label: 'Mata Pelajaran',
              value: detail.mataPelajaranNama,
            ),
            const Divider(height: 16),
            _MetadataRow(
              icon: Icons.category,
              label: 'Kategori',
              value: detail.kategoriNama,
            ),
            const Divider(height: 16),
            _MetadataRow(
              icon: Icons.calendar_today,
              label: 'Tahun Terbit',
              value: '${detail.tahunTerbit}',
            ),
            if (detail.tanggalPublish != null) ...[
              const Divider(height: 16),
              _MetadataRow(
                icon: Icons.publish,
                label: 'Tanggal Publish',
                value: detail.tanggalPublish!,
              ),
            ],
            if (detail.tanggalUpdated != null) ...[
              const Divider(height: 16),
              _MetadataRow(
                icon: Icons.update,
                label: 'Terakhir Diperbarui',
                value: detail.tanggalUpdated!,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _MetadataRow extends StatelessWidget {
  const _MetadataRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 18, color: Colors.grey.shade600),
        const SizedBox(width: 8),
        SizedBox(
          width: 120,
          child: Text(
            label,
            style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
          ),
        ),
        Expanded(
          child: Text(
            value,
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
          ),
        ),
      ],
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final isPublished = status == 'published';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: isPublished ? Colors.green.shade50 : Colors.orange.shade50,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        isPublished ? 'Published' : 'Draft',
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: isPublished ? Colors.green.shade700 : Colors.orange.shade700,
        ),
      ),
    );
  }
}

class _ContentTypeBadge extends StatelessWidget {
  const _ContentTypeBadge({required this.kontenType});

  final String kontenType;

  @override
  Widget build(BuildContext context) {
    final isFile = kontenType == 'file';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: isFile ? Colors.blue.shade50 : Colors.teal.shade50,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            isFile ? Icons.attach_file : Icons.edit_note,
            size: 14,
            color: isFile ? Colors.blue.shade700 : Colors.teal.shade700,
          ),
          const SizedBox(width: 4),
          Text(
            isFile ? 'File' : 'Teks',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: isFile ? Colors.blue.shade700 : Colors.teal.shade700,
            ),
          ),
        ],
      ),
    );
  }
}
