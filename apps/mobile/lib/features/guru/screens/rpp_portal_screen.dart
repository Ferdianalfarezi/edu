import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/app_router.dart';
import '../models/rpp_models.dart';
import '../providers/rpp_provider.dart';

/// Portal screen for browsing and searching published RPPs.
///
/// Requirements: 43.1–43.7
/// - Shows all published RPPs in the tenant (43.1, 43.7)
/// - Filter by kategori, mata pelajaran, tahun terbit (43.2)
/// - Search by judul (43.3)
/// - Tap to view detail (43.4)
class RppPortalScreen extends ConsumerStatefulWidget {
  const RppPortalScreen({super.key});

  @override
  ConsumerState<RppPortalScreen> createState() => _RppPortalScreenState();
}

class _RppPortalScreenState extends ConsumerState<RppPortalScreen> {
  final _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _onSearchSubmitted(String value) {
    ref.read(rppFilterProvider.notifier).update(
          (state) => state.copyWith(search: value.trim()),
        );
  }

  void _clearSearch() {
    _searchController.clear();
    ref.read(rppFilterProvider.notifier).update(
          (state) => state.copyWith(clearSearch: true),
        );
  }

  @override
  Widget build(BuildContext context) {
    final rppListAsync = ref.watch(rppListProvider);
    final filter = ref.watch(rppFilterProvider);
    final mapelAsync = ref.watch(mapelOptionsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Portal RPP'),
        actions: [
          IconButton(
            icon: const Icon(Icons.favorite),
            tooltip: 'RPP Favorit Saya',
            onPressed: () => context.push(AppRoutes.guruRppFavorites),
          ),
          IconButton(
            icon: const Icon(Icons.add),
            tooltip: 'Buat RPP Baru',
            onPressed: () => context.push(AppRoutes.guruRppCreate),
          ),
        ],
      ),
      body: Column(
        children: [
          // Search bar (Req 43.3)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Cari RPP berdasarkan judul...',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: filter.search != null && filter.search!.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear),
                        onPressed: _clearSearch,
                      )
                    : null,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16),
              ),
              textInputAction: TextInputAction.search,
              onSubmitted: _onSearchSubmitted,
            ),
          ),

          // Filter chips (Req 43.2)
          _FilterSection(mapelAsync: mapelAsync),

          // RPP list
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async => ref.invalidate(rppListProvider),
              child: rppListAsync.when(
                data: (response) => _RppListView(items: response.data),
                loading: () =>
                    const Center(child: CircularProgressIndicator()),
                error: (error, _) => Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.error_outline,
                          size: 48, color: Colors.grey),
                      const SizedBox(height: 8),
                      Text(
                        'Gagal memuat RPP',
                        style: TextStyle(color: Colors.grey.shade600),
                      ),
                      const SizedBox(height: 8),
                      TextButton(
                        onPressed: () => ref.invalidate(rppListProvider),
                        child: const Text('Coba Lagi'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Filter chips for mapel selection.
class _FilterSection extends ConsumerWidget {
  const _FilterSection({required this.mapelAsync});

  final AsyncValue<List<MapelOption>> mapelAsync;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final filter = ref.watch(rppFilterProvider);

    return SizedBox(
      height: 48,
      child: mapelAsync.when(
        data: (mapelList) => ListView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          children: [
            // "Semua" chip
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: FilterChip(
                label: const Text('Semua'),
                selected: filter.mapelId == null,
                onSelected: (_) {
                  ref.read(rppFilterProvider.notifier).update(
                        (state) => state.copyWith(clearMapel: true),
                      );
                },
              ),
            ),
            // Mapel chips
            ...mapelList.map((mapel) => Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: FilterChip(
                    label: Text(mapel.nama),
                    selected: filter.mapelId == mapel.id,
                    onSelected: (selected) {
                      ref.read(rppFilterProvider.notifier).update(
                            (state) => selected
                                ? state.copyWith(mapelId: mapel.id)
                                : state.copyWith(clearMapel: true),
                          );
                    },
                  ),
                )),
          ],
        ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => const SizedBox.shrink(),
      ),
    );
  }
}

/// List view of RPP items.
class _RppListView extends ConsumerWidget {
  const _RppListView({required this.items});

  final List<RppItem> items;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (items.isEmpty) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.description_outlined, size: 64, color: Colors.grey),
            SizedBox(height: 12),
            Text(
              'Belum ada RPP yang tersedia',
              style: TextStyle(color: Colors.grey, fontSize: 16),
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
        return _RppCard(item: item);
      },
    );
  }
}

/// Card for a single RPP item in the list.
class _RppCard extends ConsumerWidget {
  const _RppCard({required this.item});

  final RppItem item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final favoriteNotifier = ref.watch(rppFavoriteNotifierProvider.notifier);
    final isFavorited = favoriteNotifier.isFavorited(
      item.id,
      serverState: item.isFavorited,
    );

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
              // Content type badge
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

              // Main content
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
                    Row(
                      children: [
                        _Badge(
                          text: item.kategoriNama,
                          color: Colors.purple.shade50,
                          textColor: Colors.purple.shade700,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          '${item.tahunTerbit}',
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey.shade500,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              // Favorite star (Req 44.1, 44.2)
              IconButton(
                icon: Icon(
                  isFavorited ? Icons.star : Icons.star_border,
                  color: isFavorited ? Colors.amber : Colors.grey,
                ),
                onPressed: () {
                  favoriteNotifier.toggleFavorite(
                    item.id,
                    currentState: isFavorited,
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Small badge widget for category/type labels.
class _Badge extends StatelessWidget {
  const _Badge({
    required this.text,
    required this.color,
    required this.textColor,
  });

  final String text;
  final Color color;
  final Color textColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        text,
        style: TextStyle(fontSize: 11, color: textColor),
      ),
    );
  }
}
