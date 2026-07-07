import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/attendance_models.dart';
import '../providers/attendance_provider.dart';

/// Parent attendance view screen.
///
/// Displays:
/// - Child selector at top (if parent has multiple children)
/// - Month/year selector
/// - Calendar grid with color-coded attendance statuses
/// - Summary bar with hadir/izin/sakit/alpa totals
///
/// Requirements: 8.1–8.4, 21.9, 21.10
class AttendanceScreen extends ConsumerStatefulWidget {
  const AttendanceScreen({super.key});

  @override
  ConsumerState<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends ConsumerState<AttendanceScreen> {
  @override
  Widget build(BuildContext context) {
    final childrenAsync = ref.watch(parentChildrenGroupedProvider);
    final viewState = ref.watch(attendanceViewStateProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Absensi Anak'),
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

          // Flatten all children to create child list
          final allChildren =
              groups.expand((g) => g.children).toList();

          // Auto-select first child if none selected
          final selectedChildId = viewState.selectedChildId ?? allChildren.first.siswaId;

          // Ensure selected child is valid
          if (!allChildren.any((c) => c.siswaId == selectedChildId)) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              ref.read(attendanceViewStateProvider.notifier)
                  .selectChild(allChildren.first.siswaId);
            });
          }

          return Column(
            children: [
              // Child selector (Requirement 8.4: separate per child)
              if (allChildren.length > 1)
                _ChildSelector(
                  groups: groups,
                  selectedChildId: selectedChildId,
                  onChildSelected: (id) {
                    ref.read(attendanceViewStateProvider.notifier).selectChild(id);
                  },
                ),

              // Month selector (Requirement 8.3)
              _MonthSelector(
                month: viewState.selectedMonth,
                year: viewState.selectedYear,
                onPrevious: () {
                  ref.read(attendanceViewStateProvider.notifier).previousMonth();
                },
                onNext: () {
                  ref.read(attendanceViewStateProvider.notifier).nextMonth();
                },
              ),

              // Calendar + Summary
              Expanded(
                child: _AttendanceBody(
                  siswaId: selectedChildId,
                  bulan: viewState.selectedMonth,
                  tahun: viewState.selectedYear,
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

/// Dropdown child selector grouped by school.
/// Requirement 21.10: multi-school grouping.
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
      // Add school header as disabled item if multiple schools
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

      // Add children
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

/// Month/year navigation selector.
class _MonthSelector extends StatelessWidget {
  const _MonthSelector({
    required this.month,
    required this.year,
    required this.onPrevious,
    required this.onNext,
  });

  final int month;
  final int year;
  final VoidCallback onPrevious;
  final VoidCallback onNext;

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
    final now = DateTime.now();
    final isCurrentOrFuture =
        year > now.year || (year == now.year && month >= now.month);

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          IconButton(
            icon: const Icon(Icons.chevron_left),
            onPressed: onPrevious,
            tooltip: 'Bulan sebelumnya',
          ),
          Text(
            '${_monthNames[month - 1]} $year',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
          ),
          IconButton(
            icon: const Icon(Icons.chevron_right),
            onPressed: isCurrentOrFuture ? null : onNext,
            tooltip: 'Bulan selanjutnya',
          ),
        ],
      ),
    );
  }
}

/// Calendar grid and summary — fetches data based on selected child + month.
class _AttendanceBody extends ConsumerWidget {
  const _AttendanceBody({
    required this.siswaId,
    required this.bulan,
    required this.tahun,
  });

  final String siswaId;
  final int bulan;
  final int tahun;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final params = AttendanceFetchParams(
      siswaId: siswaId,
      bulan: bulan,
      tahun: tahun,
    );
    final attendanceAsync = ref.watch(childAttendanceProvider(params));

    return attendanceAsync.when(
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
                'Gagal memuat data absensi',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => ref.invalidate(childAttendanceProvider(params)),
                child: const Text('Coba Lagi'),
              ),
            ],
          ),
        ),
      ),
      data: (response) {
        return SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              // Calendar grid (Requirement 8.1)
              _CalendarGrid(
                month: bulan,
                year: tahun,
                records: response.records,
              ),
              const SizedBox(height: 16),
              // Summary bar (Requirement 8.2)
              _SummaryBar(summary: response.summary),
              const SizedBox(height: 16),
              // Legend
              const _CalendarLegend(),
            ],
          ),
        );
      },
    );
  }
}

/// Color-coded calendar grid for a month.
/// Requirement 8.1: calendar with different colors per status.
class _CalendarGrid extends StatelessWidget {
  const _CalendarGrid({
    required this.month,
    required this.year,
    required this.records,
  });

  final int month;
  final int year;
  final List<AttendanceRecord> records;

  @override
  Widget build(BuildContext context) {
    final firstDay = DateTime(year, month, 1);
    final daysInMonth = DateTime(year, month + 1, 0).day;
    // Monday = 1, Sunday = 7
    final startWeekday = firstDay.weekday;

    // Build a lookup map: day number → status
    final statusMap = <int, AttendanceStatus>{};
    for (final record in records) {
      if (record.tanggal.month == month && record.tanggal.year == year) {
        statusMap[record.tanggal.day] = record.status;
      }
    }

    return Card(
      elevation: 1,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          children: [
            // Day headers (Sen, Sel, Rab, Kam, Jum, Sab, Min)
            const _DayHeaders(),
            const SizedBox(height: 8),
            // Calendar cells
            _buildCalendarRows(context, daysInMonth, startWeekday, statusMap),
          ],
        ),
      ),
    );
  }

  Widget _buildCalendarRows(
    BuildContext context,
    int daysInMonth,
    int startWeekday,
    Map<int, AttendanceStatus> statusMap,
  ) {
    final rows = <Widget>[];
    var currentDay = 1;

    // Calculate number of rows needed
    final totalCells = (startWeekday - 1) + daysInMonth;
    final rowCount = (totalCells / 7).ceil();

    for (var row = 0; row < rowCount; row++) {
      final cells = <Widget>[];

      for (var col = 0; col < 7; col++) {
        final cellIndex = row * 7 + col;
        final dayOffset = cellIndex - (startWeekday - 1);

        if (dayOffset < 0 || dayOffset >= daysInMonth) {
          // Empty cell
          cells.add(const Expanded(child: SizedBox(height: 40)));
        } else {
          final dayNum = dayOffset + 1;
          final date = DateTime(year, month, dayNum);
          final isWeekend = date.weekday == 7; // Sunday
          final status = statusMap[dayNum];

          cells.add(
            Expanded(
              child: _DayCell(
                day: dayNum,
                status: status,
                isWeekend: isWeekend,
              ),
            ),
          );
        }
      }

      rows.add(
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 2),
          child: Row(children: cells),
        ),
      );
    }

    return Column(children: rows);
  }
}

/// Day header row (Sen, Sel, Rab, ...)
class _DayHeaders extends StatelessWidget {
  const _DayHeaders();

  static const _days = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

  @override
  Widget build(BuildContext context) {
    return Row(
      children: _days.map((d) {
        return Expanded(
          child: Center(
            child: Text(
              d,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: d == 'Min'
                    ? Colors.red.shade300
                    : Theme.of(context).textTheme.bodySmall?.color,
              ),
            ),
          ),
        );
      }).toList(),
    );
  }
}

/// Single day cell in the calendar.
class _DayCell extends StatelessWidget {
  const _DayCell({
    required this.day,
    this.status,
    this.isWeekend = false,
  });

  final int day;
  final AttendanceStatus? status;
  final bool isWeekend;

  Color _backgroundColor() {
    if (status == null) {
      return isWeekend ? Colors.grey.shade200 : Colors.grey.shade100;
    }
    switch (status!) {
      case AttendanceStatus.hadir:
        return Colors.green.shade400;
      case AttendanceStatus.izin:
        return Colors.blue.shade400;
      case AttendanceStatus.sakit:
        return Colors.orange.shade400;
      case AttendanceStatus.alpa:
        return Colors.red.shade400;
    }
  }

  Color _textColor() {
    if (status == null) {
      return isWeekend ? Colors.grey.shade500 : Colors.black87;
    }
    return Colors.white;
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 36,
      margin: const EdgeInsets.all(2),
      decoration: BoxDecoration(
        color: _backgroundColor(),
        borderRadius: BorderRadius.circular(6),
      ),
      alignment: Alignment.center,
      child: Text(
        '$day',
        style: TextStyle(
          fontSize: 13,
          fontWeight: status != null ? FontWeight.w600 : FontWeight.normal,
          color: _textColor(),
        ),
      ),
    );
  }
}

/// Summary bar showing totals for each status.
/// Requirement 8.2: summary totals.
class _SummaryBar extends StatelessWidget {
  const _SummaryBar({required this.summary});

  final AttendanceSummary summary;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 1,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: [
            _SummaryItem(
              label: 'Hadir',
              count: summary.hadir,
              color: Colors.green.shade400,
            ),
            _SummaryItem(
              label: 'Izin',
              count: summary.izin,
              color: Colors.blue.shade400,
            ),
            _SummaryItem(
              label: 'Sakit',
              count: summary.sakit,
              color: Colors.orange.shade400,
            ),
            _SummaryItem(
              label: 'Alpa',
              count: summary.alpa,
              color: Colors.red.shade400,
            ),
          ],
        ),
      ),
    );
  }
}

class _SummaryItem extends StatelessWidget {
  const _SummaryItem({
    required this.label,
    required this.count,
    required this.color,
  });

  final String label;
  final int count;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(8),
          ),
          alignment: Alignment.center,
          child: Text(
            '$count',
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.bold,
              fontSize: 16,
            ),
          ),
        ),
        const SizedBox(height: 4),
        Text(
          label,
          style: const TextStyle(fontSize: 12),
        ),
      ],
    );
  }
}

/// Legend explaining the color codes.
class _CalendarLegend extends StatelessWidget {
  const _CalendarLegend();

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 16,
      runSpacing: 8,
      children: [
        _LegendItem(color: Colors.green.shade400, label: 'Hadir'),
        _LegendItem(color: Colors.blue.shade400, label: 'Izin'),
        _LegendItem(color: Colors.orange.shade400, label: 'Sakit'),
        _LegendItem(color: Colors.red.shade400, label: 'Alpa'),
        _LegendItem(color: Colors.grey.shade200, label: 'Libur/Weekend'),
      ],
    );
  }
}

class _LegendItem extends StatelessWidget {
  const _LegendItem({required this.color, required this.label});

  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 14,
          height: 14,
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(3),
          ),
        ),
        const SizedBox(width: 4),
        Text(label, style: const TextStyle(fontSize: 12)),
      ],
    );
  }
}
