import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/jadwal_entry.dart';
import '../providers/jadwal_provider.dart';

/// Guru Jadwal (teaching schedule) view screen.
///
/// Displays:
/// - Day selector chips (respects hari_kerja: Senin–Jumat or Senin–Sabtu)
/// - List of jadwal entries for the selected day
/// - Each card: jam_mulai–jam_selesai, kelas name, mapel name
/// - Guru pengganti indicator when substitute is assigned
///
/// Requirements: 33.1, 33.2, 33.3, 33.4
class GuruJadwalScreen extends ConsumerWidget {
  const GuruJadwalScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selectedHari = ref.watch(selectedHariProvider);
    final jadwalAsync = ref.watch(jadwalSayaProvider(selectedHari));
    final activeDays = ref.watch(activeHariListProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Jadwal Mengajar'),
      ),
      body: Column(
        children: [
          // Day selector chips
          _DaySelector(
            selectedHari: selectedHari,
            availableDays: activeDays,
            onSelected: (hari) {
              ref.read(selectedHariProvider.notifier).state = hari;
            },
          ),

          const Divider(height: 1),

          // Jadwal list
          Expanded(
            child: jadwalAsync.when(
              data: (response) => _JadwalList(jadwal: response.jadwal),
              loading: () => const Center(
                child: CircularProgressIndicator(),
              ),
              error: (error, _) => _ErrorView(
                error: error,
                onRetry: () => ref.invalidate(jadwalSayaProvider(selectedHari)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Horizontal day selector using ChoiceChips.
class _DaySelector extends StatelessWidget {
  const _DaySelector({
    required this.selectedHari,
    required this.availableDays,
    required this.onSelected,
  });

  final String selectedHari;
  final List<String> availableDays;
  final ValueChanged<String> onSelected;

  static const _dayLabels = {
    'senin': 'Sen',
    'selasa': 'Sel',
    'rabu': 'Rab',
    'kamis': 'Kam',
    'jumat': 'Jum',
    'sabtu': 'Sab',
  };

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: availableDays.map((hari) {
            final isSelected = hari == selectedHari;
            return Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ChoiceChip(
                label: Text(_dayLabels[hari] ?? hari),
                selected: isSelected,
                onSelected: (_) => onSelected(hari),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }
}

/// Displays the list of jadwal entries, or an empty state if none.
class _JadwalList extends StatelessWidget {
  const _JadwalList({required this.jadwal});

  final List<JadwalEntry> jadwal;

  @override
  Widget build(BuildContext context) {
    if (jadwal.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.event_busy, size: 64, color: Colors.grey),
              SizedBox(height: 16),
              Text(
                'Tidak ada jadwal untuk hari ini',
                style: TextStyle(fontSize: 16, color: Colors.grey),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: jadwal.length,
      separatorBuilder: (_, __) => const SizedBox(height: 12),
      itemBuilder: (context, index) => _JadwalCard(entry: jadwal[index]),
    );
  }
}

/// A card showing a single jadwal slot.
///
/// Layout:
/// - Left: jam_mulai – jam_selesai (time column)
/// - Center: kelas name + mapel name
/// - Badge: guru pengganti indicator (if applicable)
class _JadwalCard extends StatelessWidget {
  const _JadwalCard({required this.entry});

  final JadwalEntry entry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      elevation: 1,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                // Time column
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 8,
                  ),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.primaryContainer,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Column(
                    children: [
                      Text(
                        entry.jamMulai,
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: theme.colorScheme.onPrimaryContainer,
                        ),
                      ),
                      Text(
                        '–',
                        style: TextStyle(
                          color: theme.colorScheme.onPrimaryContainer,
                        ),
                      ),
                      Text(
                        entry.jamSelesai,
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: theme.colorScheme.onPrimaryContainer,
                        ),
                      ),
                    ],
                  ),
                ),

                const SizedBox(width: 16),

                // Class & subject info
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        entry.kelasNama,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        entry.mataPelajaranNama,
                        style: TextStyle(
                          fontSize: 14,
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),

            // Guru pengganti indicator
            if (entry.hasGuruPengganti) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: Colors.orange.shade50,
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: Colors.orange.shade200),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.swap_horiz,
                      size: 16,
                      color: Colors.orange.shade700,
                    ),
                    const SizedBox(width: 6),
                    Flexible(
                      child: Text(
                        'Digantikan oleh: ${entry.guruPenggantiNama ?? '-'}',
                        style: TextStyle(
                          fontSize: 13,
                          color: Colors.orange.shade800,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Error view with retry button.
class _ErrorView extends StatelessWidget {
  const _ErrorView({
    required this.error,
    required this.onRetry,
  });

  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 48, color: Colors.red),
            const SizedBox(height: 16),
            const Text(
              'Gagal memuat jadwal',
              style: TextStyle(fontSize: 16),
            ),
            const SizedBox(height: 8),
            Text(
              error.toString(),
              style: const TextStyle(fontSize: 12, color: Colors.grey),
              textAlign: TextAlign.center,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Coba Lagi'),
            ),
          ],
        ),
      ),
    );
  }
}
