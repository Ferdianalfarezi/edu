import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/router/app_router.dart';
import '../models/attendance_models.dart';
import '../models/rapor_models.dart';
import '../providers/attendance_provider.dart';
import '../providers/rapor_provider.dart';

/// Parent rapor list screen.
///
/// Displays:
/// - Child selector at top (same pattern as attendance/tagihan)
/// - List of finalized rapor periods for the selected child
/// - Each item shows: periode name, tahun_ajaran, finalized_at date
///
/// Requirements: 39.1, 39.2, 39.4
class RaporScreen extends ConsumerStatefulWidget {
  const RaporScreen({super.key});

  @override
  ConsumerState<RaporScreen> createState() => _RaporScreenState();
}

class _RaporScreenState extends ConsumerState<RaporScreen> {
  String? _selectedChildId;

  @override
  Widget build(BuildContext context) {
    final childrenAsync = ref.watch(parentChildrenGroupedProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Rapor Anak'),
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
                  onPressed: () =>
                      ref.invalidate(parentChildrenGroupedProvider),
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

          // Auto-select first child if none selected
          final selectedChildId = _selectedChildId ?? allChildren.first.siswaId;

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
              // Child selector (Requirement 39.4: per-child separation)
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

              // Rapor period list
              Expanded(
                child: _RaporPeriodList(siswaId: selectedChildId),
              ),
            ],
          );
        },
      ),
    );
  }
}

/// Child dropdown selector, grouped by school.
/// Same pattern as AttendanceScreen._ChildSelector.
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
        initialValue: selectedChildId,
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

/// List of finalized rapor periods for the selected child.
/// Requirement 39.1: list of available periods (only final).
/// Requirement 39.2: only finalized rapor visible.
class _RaporPeriodList extends ConsumerWidget {
  const _RaporPeriodList({required this.siswaId});

  final String siswaId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final periodsAsync = ref.watch(childRaporPeriodsProvider(siswaId));

    return periodsAsync.when(
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
                'Gagal memuat data rapor',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () =>
                    ref.invalidate(childRaporPeriodsProvider(siswaId)),
                child: const Text('Coba Lagi'),
              ),
            ],
          ),
        ),
      ),
      data: (periods) {
        if (periods.isEmpty) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.assignment_outlined,
                    size: 64,
                    color: Colors.grey.shade400,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Belum ada rapor yang tersedia',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          color: Colors.grey.shade600,
                        ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Rapor akan tampil setelah difinalkan oleh Wali Kelas.',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Colors.grey.shade500,
                        ),
                  ),
                ],
              ),
            ),
          );
        }

        return ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: periods.length,
          separatorBuilder: (_, __) => const SizedBox(height: 8),
          itemBuilder: (context, index) {
            final period = periods[index];
            return _RaporPeriodCard(
              period: period,
              siswaId: siswaId,
            );
          },
        );
      },
    );
  }
}

/// Card for a single rapor period.
class _RaporPeriodCard extends StatelessWidget {
  const _RaporPeriodCard({
    required this.period,
    required this.siswaId,
  });

  final RaporPeriode period;
  final String siswaId;

  @override
  Widget build(BuildContext context) {
    final dateFormat = DateFormat('d MMMM yyyy', 'id_ID');

    return Card(
      elevation: 1,
      child: ListTile(
        leading: Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.primaryContainer,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(
            Icons.assignment,
            color: Theme.of(context).colorScheme.primary,
          ),
        ),
        title: Text(
          period.label,
          style: const TextStyle(fontWeight: FontWeight.w600),
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Tahun Ajaran: ${period.tahunAjaran}'),
            if (period.finalizedAt != null)
              Text(
                'Difinalkan: ${dateFormat.format(period.finalizedAt!)}',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Colors.grey.shade600,
                    ),
              ),
          ],
        ),
        trailing: const Icon(Icons.chevron_right),
        onTap: () {
          context.push(
            '${AppRoutes.orangTuaRapor}/$siswaId/${period.periodeId}',
          );
        },
      ),
    );
  }
}
