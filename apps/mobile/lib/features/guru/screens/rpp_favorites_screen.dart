import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/app_router.dart';
import '../models/rpp_models.dart';
import '../providers/rpp_provider.dart';

/// Screen showing the guru's favorited RPPs.
///
/// Requirements: 44.3, 44.4, 44.5
/// - List of all favorited RPPs (44.3)
/// - Independent per guru (44.4)
/// - Hides RPPs that have been changed to draft (44.5)
class RppFavoritesScreen extends ConsumerWidget {
  const RppFavoritesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final favoritesAsync = ref.watch(rppFavoritesProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('RPP Favorit Saya'),
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(rppFavoritesProvider),
        child: favoritesAsync.when(
          data: (response) => _FavoritesList(items: response.data),
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.error_outline, size: 48, color: Colors.grey),
                const SizedBox(height: 8),
                Text(
                  'Gagal memuat favorit',
                  style: TextStyle(color: Colors.grey.shade600),
                ),
                const SizedBox(height: 8),
                TextButton(
                  onPressed: () => ref.invalidate(rppFavoritesProvider),
                  child: const Text('Coba Lagi'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _FavoritesList extends ConsumerWidget {
  const _FavoritesList({required this.items});

  final List<RppItem> items;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (items.isEmpty) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.star_border, size: 64, color: Colors.grey),
            SizedBox(height: 12),
            Text(
              'Belum ada RPP favorit',
              style: TextStyle(color: Colors.grey, fontSize: 16),
            ),
            SizedBox(height: 4),
            Text(
              'Tekan bintang pada RPP di portal untuk menambahkan',
              style: TextStyle(color: Colors.grey, fontSize: 13),
            ),
          ],
        ),
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: items.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (context, index) {
        final item = items[index];
        return _FavoriteCard(item: item);
      },
    );
  }
}

class _FavoriteCard extends ConsumerWidget {
  const _FavoriteCard({required this.item});

  final RppItem item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final favoriteNotifier = ref.watch(rppFavoriteNotifierProvider.notifier);

    return Card(
      elevation: 1,
      margin: EdgeInsets.zero,
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => context.push('${AppRoutes.guruRppPortal}/${item.id}'),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Content type icon
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: item.kontenType == 'file'
                      ? Colors.blue.shade50
                      : Colors.green.shade50,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(
                  item.kontenType == 'file'
                      ? Icons.attach_file
                      : Icons.edit_note,
                  color: item.kontenType == 'file'
                      ? Colors.blue.shade700
                      : Colors.green.shade700,
                  size: 20,
                ),
              ),
              const SizedBox(width: 12),

              // Content
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.judul,
                      style: const TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 15,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${item.guruNama} • ${item.mataPelajaranNama}',
                      style: TextStyle(
                        fontSize: 13,
                        color: Colors.grey.shade600,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      item.kategoriNama,
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.purple.shade600,
                      ),
                    ),
                  ],
                ),
              ),

              // Unfavorite button (Req 44.2 — toggle off)
              IconButton(
                icon: const Icon(Icons.star, color: Colors.amber),
                tooltip: 'Hapus dari favorit',
                onPressed: () {
                  favoriteNotifier.toggleFavorite(
                    item.id,
                    currentState: true,
                  );
                  // Refresh favorites list after toggle
                  ref.invalidate(rppFavoritesProvider);
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}
