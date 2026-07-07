import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/router/app_router.dart';
import '../models/attendance_models.dart';
import '../models/tagihan_models.dart';
import '../providers/attendance_provider.dart';
import '../providers/tagihan_provider.dart';

/// Parent tagihan (billing) screen.
///
/// Displays:
/// - Child selector at top (reuse pattern from attendance_screen)
/// - List of tagihan per selected child with color-coded status badges
/// - Each tagihan shows: bulan/tahun, nominal, total_dibayar, sisa, status, jatuh_tempo
/// - Action button "Bayar" on unpaid tagihan (belum_bayar, ditolak, cicilan)
///
/// Requirements: 11.1, 14.1–14.3
class TagihanScreen extends ConsumerStatefulWidget {
  const TagihanScreen({super.key});

  @override
  ConsumerState<TagihanScreen> createState() => _TagihanScreenState();
}

class _TagihanScreenState extends ConsumerState<TagihanScreen> {
  String? _selectedChildId;

  @override
  Widget build(BuildContext context) {
    final childrenAsync = ref.watch(parentChildrenGroupedProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Tagihan SPP'),
      ),
      body: childrenAsync.when(
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
                  'Gagal memuat data anak',
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
                  onPressed: () => ref.invalidate(parentChildrenGroupedProvider),
                  child: const Text('Coba Lagi'),
                ),
              ],
            ),
          ),
        ),
        data: (groups) {
          if (groups.isEmpty) {
            return const Center(
              child: Text('Tidak ada data anak yang terdaftar.'),
            );
          }

          final allChildren = groups.expand((g) => g.children).toList();
          final selectedChildId =
              _selectedChildId ?? allChildren.first.siswaId;

          // Ensure selected child is valid
          if (!allChildren.any((c) => c.siswaId == selectedChildId)) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              setState(() {
                _selectedChildId = allChildren.first.siswaId;
              });
            });
          }

          return Column(
            children: [
              // Child selector (Requirement 14.3: separate per child)
              if (allChildren.length > 1)
                _ChildSelector(
                  groups: groups,
                  selectedChildId: selectedChildId,
                  onChildSelected: (id) {
                    setState(() {
                      _selectedChildId = id;
                    });
                  },
                ),

              // Tagihan list
              Expanded(
                child: _TagihanList(siswaId: selectedChildId),
              ),
            ],
          );
        },
      ),
    );
  }
}

/// Child selector dropdown, grouped by school.
/// Same pattern as attendance_screen.
class _ChildSelector extends StatelessWidget {
  const _ChildSelector({
    required this.groups,
    required this.selectedChildId,
    required this.onChildSelected,
  });

  final List<SchoolChildGroup> groups;
  final String selectedChildId;
  final ValueChanged<String> onChildSelected;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        border: Border(
          bottom: BorderSide(
            color: Theme.of(context).dividerColor,
            width: 0.5,
          ),
        ),
      ),
      child: DropdownButtonFormField<String>(
        value: selectedChildId,
        decoration: const InputDecoration(
          labelText: 'Pilih Anak',
          border: OutlineInputBorder(),
          isDense: true,
          contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        ),
        items: _buildDropdownItems(),
        onChanged: (value) {
          if (value != null) {
            onChildSelected(value);
          }
        },
      ),
    );
  }

  List<DropdownMenuItem<String>> _buildDropdownItems() {
    final items = <DropdownMenuItem<String>>[];

    for (final group in groups) {
      if (groups.length > 1) {
        items.add(
          DropdownMenuItem<String>(
            enabled: false,
            value: '__header_${group.tenantId}',
            child: Text(
              group.tenantNama,
              style: const TextStyle(
                fontWeight: FontWeight.bold,
                fontSize: 12,
                color: Colors.grey,
              ),
            ),
          ),
        );
      }

      for (final child in group.children) {
        final subtitle = groups.length > 1
            ? '${child.nama} - ${child.kelasNama}'
            : '${child.nama} (${child.kelasNama})';
        items.add(
          DropdownMenuItem<String>(
            value: child.siswaId,
            child: Text(subtitle),
          ),
        );
      }
    }

    return items;
  }
}

/// Tagihan list fetched for the selected child.
class _TagihanList extends ConsumerWidget {
  const _TagihanList({required this.siswaId});

  final String siswaId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tagihanAsync = ref.watch(childTagihanProvider(siswaId));

    return tagihanAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, stack) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, size: 40, color: Colors.orange),
              const SizedBox(height: 8),
              Text(
                'Gagal memuat data tagihan',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () =>
                    ref.invalidate(childTagihanProvider(siswaId)),
                child: const Text('Coba Lagi'),
              ),
            ],
          ),
        ),
      ),
      data: (tagihanList) {
        if (tagihanList.isEmpty) {
          return const Center(
            child: Padding(
              padding: EdgeInsets.all(24),
              child: Text('Tidak ada tagihan.'),
            ),
          );
        }

        return RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(childTagihanProvider(siswaId));
          },
          child: ListView.builder(
            padding: const EdgeInsets.all(12),
            itemCount: tagihanList.length,
            itemBuilder: (context, index) {
              return _TagihanCard(tagihan: tagihanList[index]);
            },
          ),
        );
      },
    );
  }
}

/// A single tagihan card with status badge and action.
class _TagihanCard extends StatelessWidget {
  const _TagihanCard({required this.tagihan});

  final Tagihan tagihan;

  static const _monthNames = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
  ];

  @override
  Widget build(BuildContext context) {
    final currencyFormat =
        NumberFormat.currency(locale: 'id_ID', symbol: 'Rp ', decimalDigits: 0);

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        onTap: () {
          // Navigate to payment history
          context.push(
            AppRoutes.orangTuaPaymentHistory,
            extra: tagihan,
          );
        },
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header: Bulan/Tahun + Status badge
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    '${_monthNames[tagihan.bulan - 1]} ${tagihan.tahun}',
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  _StatusBadge(status: tagihan.status),
                ],
              ),
              const SizedBox(height: 10),

              // Nominal & Payment info
              _InfoRow(
                label: 'Nominal',
                value: currencyFormat.format(tagihan.nominal),
              ),
              if (tagihan.totalDibayar > 0)
                _InfoRow(
                  label: 'Dibayar',
                  value: currencyFormat.format(tagihan.totalDibayar),
                ),
              if (tagihan.sisa > 0 && tagihan.status != TagihanStatus.lunas)
                _InfoRow(
                  label: 'Sisa',
                  value: currencyFormat.format(tagihan.sisa),
                  valueColor: Colors.red.shade700,
                ),
              if (tagihan.tanggalJatuhTempo != null)
                _InfoRow(
                  label: 'Jatuh Tempo',
                  value: DateFormat('dd MMM yyyy', 'id_ID')
                      .format(tagihan.tanggalJatuhTempo!),
                ),

              // Action button (Requirement 11.1: show "Bayar" on payable statuses)
              if (tagihan.status.canUpload) ...[
                const SizedBox(height: 10),
                Align(
                  alignment: Alignment.centerRight,
                  child: FilledButton.icon(
                    onPressed: () {
                      context.push(
                        AppRoutes.orangTuaUploadBukti,
                        extra: tagihan,
                      );
                    },
                    icon: const Icon(Icons.upload_file, size: 18),
                    label: const Text('Bayar'),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Color-coded status badge.
class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});

  final TagihanStatus status;

  Color _backgroundColor() {
    switch (status) {
      case TagihanStatus.belumBayar:
        return Colors.orange.shade100;
      case TagihanStatus.menungguVerifikasi:
        return Colors.blue.shade100;
      case TagihanStatus.cicilan:
        return Colors.amber.shade100;
      case TagihanStatus.lunas:
        return Colors.green.shade100;
      case TagihanStatus.ditolak:
        return Colors.red.shade100;
      case TagihanStatus.dibatalkan:
        return Colors.grey.shade200;
    }
  }

  Color _textColor() {
    switch (status) {
      case TagihanStatus.belumBayar:
        return Colors.orange.shade900;
      case TagihanStatus.menungguVerifikasi:
        return Colors.blue.shade900;
      case TagihanStatus.cicilan:
        return Colors.amber.shade900;
      case TagihanStatus.lunas:
        return Colors.green.shade900;
      case TagihanStatus.ditolak:
        return Colors.red.shade900;
      case TagihanStatus.dibatalkan:
        return Colors.grey.shade700;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: _backgroundColor(),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        status.label,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: _textColor(),
        ),
      ),
    );
  }
}

/// Simple label-value row for tagihan details.
class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.label,
    required this.value,
    this.valueColor,
  });

  final String label;
  final String value;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: 13,
              color: Colors.grey.shade700,
            ),
          ),
          Text(
            value,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w500,
              color: valueColor,
            ),
          ),
        ],
      ),
    );
  }
}
