import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/rapor_models.dart';
import '../providers/rapor_provider.dart';

/// Full rapor detail screen for a specific child + period.
///
/// Displays:
/// - Header: siswa name, kelas, periode, rata-rata, peringkat
/// - Per-mapel section: komponen values (angka/huruf), capaian_pembelajaran
/// - P5 section: Profil Pelajar Pancasila dimensi + deskripsi
/// - Catatan wali kelas section
///
/// Requirements: 39.3, 39.5
class RaporDetailScreen extends ConsumerWidget {
  const RaporDetailScreen({
    super.key,
    required this.siswaId,
    required this.periodeId,
  });

  final String siswaId;
  final String periodeId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final params = RaporDetailParams(siswaId: siswaId, periodeId: periodeId);
    final detailAsync = ref.watch(childRaporDetailProvider(params));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Detail Rapor'),
      ),
      body: detailAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, stack) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.error_outline, size: 48, color: Colors.red),
                const SizedBox(height: 12),
                Text(
                  'Gagal memuat detail rapor',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 8),
                Text(
                  error.toString(),
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const SizedBox(height: 16),
                ElevatedButton(
                  onPressed: () =>
                      ref.invalidate(childRaporDetailProvider(params)),
                  child: const Text('Coba Lagi'),
                ),
              ],
            ),
          ),
        ),
        data: (detail) => _RaporDetailBody(detail: detail),
      ),
    );
  }
}

/// Main body content for the rapor detail.
class _RaporDetailBody extends StatelessWidget {
  const _RaporDetailBody({required this.detail});

  final RaporDetail detail;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header card: siswa info, rata-rata, peringkat
          _HeaderCard(detail: detail),
          const SizedBox(height: 16),

          // Nilai per Mata Pelajaran
          _SectionTitle(title: 'Nilai Mata Pelajaran'),
          const SizedBox(height: 8),
          ...detail.nilaiMapel.map(
            (mapel) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _MapelCard(mapel: mapel),
            ),
          ),

          // P5 Section (if available)
          if (detail.p5 != null && detail.p5!.isNotEmpty) ...[
            const SizedBox(height: 16),
            _SectionTitle(title: 'Profil Pelajar Pancasila (P5)'),
            const SizedBox(height: 8),
            _P5Section(items: detail.p5!),
          ],

          // Catatan Wali Kelas (if available)
          if (detail.catatanWaliKelas != null &&
              detail.catatanWaliKelas!.isNotEmpty) ...[
            const SizedBox(height: 16),
            _SectionTitle(title: 'Catatan Wali Kelas'),
            const SizedBox(height: 8),
            _CatatanWaliKelasCard(catatan: detail.catatanWaliKelas!),
          ],

          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

/// Header card showing student info and summary.
/// Requirement 39.5: rata-rata nilai, peringkat, jumlah mata pelajaran.
class _HeaderCard extends StatelessWidget {
  const _HeaderCard({required this.detail});

  final RaporDetail detail;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Student name and class
            Row(
              children: [
                CircleAvatar(
                  backgroundColor: theme.colorScheme.primaryContainer,
                  child: Icon(
                    Icons.person,
                    color: theme.colorScheme.primary,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        detail.siswaNama,
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      Text(
                        'Kelas ${detail.kelasNama}',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: Colors.grey.shade600,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const Divider(height: 24),

            // Periode
            Text(
              '${detail.periodeLabel} — ${detail.tahunAjaran}',
              style: theme.textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(height: 12),

            // Stats row: Rata-rata, Peringkat, Jumlah Mapel
            Row(
              children: [
                _StatChip(
                  label: 'Rata-rata',
                  value: detail.rataRata != null
                      ? detail.rataRata!.toStringAsFixed(1)
                      : '-',
                  icon: Icons.trending_up,
                  color: Colors.blue,
                ),
                const SizedBox(width: 12),
                _StatChip(
                  label: 'Peringkat',
                  value: detail.peringkat != null
                      ? '${detail.peringkat}'
                      : '-',
                  icon: Icons.emoji_events,
                  color: Colors.amber.shade700,
                ),
                const SizedBox(width: 12),
                _StatChip(
                  label: 'Mapel',
                  value: '${detail.nilaiMapel.length}',
                  icon: Icons.menu_book,
                  color: Colors.green,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Small stat chip for summary values.
class _StatChip extends StatelessWidget {
  const _StatChip({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
  });

  final String label;
  final String value;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
        decoration: BoxDecoration(
          color: color.withOpacity(0.1),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Column(
          children: [
            Icon(icon, size: 20, color: color),
            const SizedBox(height: 4),
            Text(
              value,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: color,
              ),
            ),
            Text(
              label,
              style: TextStyle(
                fontSize: 11,
                color: color.withOpacity(0.8),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Section title widget.
class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Text(
      title,
      style: Theme.of(context).textTheme.titleSmall?.copyWith(
            fontWeight: FontWeight.w700,
            color: Theme.of(context).colorScheme.primary,
          ),
    );
  }
}

/// Card showing grades for a single subject.
/// Requirement 39.3: nilai per mapel with komponen and capaian.
class _MapelCard extends StatelessWidget {
  const _MapelCard({required this.mapel});

  final NilaiMapel mapel;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      elevation: 1,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Subject name
            Text(
              mapel.mapelNama,
              style: theme.textTheme.bodyLarge?.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 8),

            // Komponen values
            if (mapel.komponen.isNotEmpty)
              ...mapel.komponen.map(
                (k) => Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text(
                          k.nama,
                          style: theme.textTheme.bodySmall,
                        ),
                      ),
                      Text(
                        k.nilai,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),

            // Capaian Pembelajaran (if available)
            if (mapel.capaianPembelajaran != null &&
                mapel.capaianPembelajaran!.isNotEmpty) ...[
              const Divider(height: 16),
              Text(
                'Capaian Pembelajaran:',
                style: theme.textTheme.bodySmall?.copyWith(
                  fontWeight: FontWeight.w600,
                  color: Colors.grey.shade700,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                mapel.capaianPembelajaran!,
                style: theme.textTheme.bodySmall?.copyWith(
                  fontStyle: FontStyle.italic,
                  color: Colors.grey.shade600,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// P5 (Profil Pelajar Pancasila) section.
/// Requirement 39.3: P5 dimensi + deskripsi.
class _P5Section extends StatelessWidget {
  const _P5Section({required this.items});

  final List<P5Item> items;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      elevation: 1,
      color: Colors.teal.shade50,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: items.map((item) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.dimensi,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                      color: Colors.teal.shade800,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    item.deskripsi,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: Colors.teal.shade700,
                    ),
                  ),
                ],
              ),
            );
          }).toList(),
        ),
      ),
    );
  }
}

/// Catatan wali kelas card.
/// Requirement 39.3: catatan wali kelas display.
class _CatatanWaliKelasCard extends StatelessWidget {
  const _CatatanWaliKelasCard({required this.catatan});

  final String catatan;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      elevation: 1,
      color: Colors.amber.shade50,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              Icons.note_alt_outlined,
              size: 20,
              color: Colors.amber.shade700,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                catatan,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: Colors.amber.shade900,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
