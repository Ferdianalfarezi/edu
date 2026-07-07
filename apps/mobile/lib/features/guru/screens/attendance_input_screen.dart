import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/connectivity_service.dart';
import '../models/jadwal_item.dart';
import '../models/student_attendance.dart';
import '../providers/attendance_provider.dart';
import '../services/attendance_sync_service.dart';

/// Attendance input screen for a specific class.
///
/// Shows student list with status selection (hadir/izin/sakit/alpa).
/// Supports offline mode: saves to Drift with event_timestamp per ADR-003.
/// Shows online/offline banner and sync queue indicator.
class AttendanceInputScreen extends ConsumerStatefulWidget {
  const AttendanceInputScreen({
    super.key,
    required this.jadwalItem,
  });

  final JadwalItem jadwalItem;

  @override
  ConsumerState<AttendanceInputScreen> createState() =>
      _AttendanceInputScreenState();
}

class _AttendanceInputScreenState extends ConsumerState<AttendanceInputScreen> {
  bool _hasInitialized = false;

  @override
  Widget build(BuildContext context) {
    final studentsAsync = ref.watch(
      classStudentsProvider(widget.jadwalItem.kelasId),
    );
    final inputState = ref.watch(
      attendanceInputProvider(widget.jadwalItem.kelasId),
    );
    final inputNotifier = ref.read(
      attendanceInputProvider(widget.jadwalItem.kelasId).notifier,
    );
    final connectivityAsync = ref.watch(connectivityStreamProvider);
    final syncStatus = ref.watch(attendanceSyncServiceProvider);

    // Initialize students when data arrives
    studentsAsync.whenData((students) {
      if (!_hasInitialized && students.isNotEmpty) {
        _hasInitialized = true;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          inputNotifier.setStudents(students);
        });
      }
    });

    // Handle submit result feedback
    ref.listen<AttendanceInputState>(
      attendanceInputProvider(widget.jadwalItem.kelasId),
      (previous, next) {
        if (next.submitResult != null &&
            previous?.submitResult != next.submitResult) {
          _showResultFeedback(context, next.submitResult!);
        }
      },
    );

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Absensi ${widget.jadwalItem.kelasNama}',
              style: const TextStyle(fontSize: 16),
            ),
            Text(
              widget.jadwalItem.mataPelajaranNama,
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w400),
            ),
          ],
        ),
        actions: [
          // Quick "mark all hadir" button
          PopupMenuButton<String>(
            icon: const Icon(Icons.more_vert),
            onSelected: (value) => inputNotifier.markAll(value),
            itemBuilder: (_) => [
              const PopupMenuItem(
                value: 'hadir',
                child: Text('Tandai semua Hadir'),
              ),
              const PopupMenuItem(
                value: 'alpa',
                child: Text('Tandai semua Alpa'),
              ),
            ],
          ),
        ],
      ),
      body: Column(
        children: [
          // Connectivity banner
          _buildConnectivityBanner(connectivityAsync),

          // Sync queue indicator
          if (syncStatus.pendingCount > 0)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 16),
              color: Colors.blue.shade50,
              child: Row(
                children: [
                  Icon(Icons.sync, size: 14, color: Colors.blue.shade700),
                  const SizedBox(width: 8),
                  Text(
                    '${syncStatus.pendingCount} data menunggu sinkronisasi',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.blue.shade700,
                    ),
                  ),
                ],
              ),
            ),

          // Error message
          if (inputState.error != null)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
              color: Colors.red.shade50,
              child: Text(
                inputState.error!,
                style: TextStyle(fontSize: 13, color: Colors.red.shade700),
              ),
            ),

          // Student list
          Expanded(
            child: studentsAsync.when(
              data: (_) => _buildStudentList(inputState, inputNotifier),
              loading: () => const Center(
                child: CircularProgressIndicator(),
              ),
              error: (error, _) => Center(
                child: Text('Gagal memuat siswa: $error'),
              ),
            ),
          ),

          // Submit button
          _buildSubmitBar(inputState, inputNotifier),
        ],
      ),
    );
  }

  Widget _buildConnectivityBanner(AsyncValue<bool> connectivityAsync) {
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
                'Mode Offline — data akan tersimpan lokal',
                style: TextStyle(fontSize: 13, color: Colors.orange.shade800),
              ),
            ],
          ),
        );
      },
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
    );
  }

  Widget _buildStudentList(
    AttendanceInputState state,
    AttendanceInputNotifier notifier,
  ) {
    if (state.students.isEmpty) {
      return const Center(
        child: Text('Tidak ada siswa di kelas ini'),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.symmetric(vertical: 8),
      itemCount: state.students.length,
      itemBuilder: (context, index) {
        final student = state.students[index];
        return _StudentAttendanceRow(
          student: student,
          index: index + 1,
          onStatusChanged: (status) {
            notifier.updateStatus(student.siswaId, status);
          },
          onKeteranganChanged: (keterangan) {
            notifier.updateKeterangan(student.siswaId, keterangan);
          },
        );
      },
    );
  }

  Widget _buildSubmitBar(
    AttendanceInputState state,
    AttendanceInputNotifier notifier,
  ) {
    final filledCount = state.students.where((s) => s.status != null).length;
    final totalCount = state.students.length;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 4,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Progress indicator
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Terisi: $filledCount / $totalCount',
                  style: TextStyle(
                    fontSize: 13,
                    color: filledCount == totalCount
                        ? Colors.green.shade700
                        : Colors.grey.shade600,
                  ),
                ),
                if (filledCount < totalCount)
                  Text(
                    'Belum lengkap',
                    style: TextStyle(
                      fontSize: 13,
                      color: Colors.orange.shade700,
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: state.isSubmitting ? null : () => notifier.submit(),
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                child: state.isSubmitting
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Text(
                        'Simpan Absensi',
                        style: TextStyle(fontSize: 16),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showResultFeedback(BuildContext context, AttendanceSubmitResult result) {
    final message = result == AttendanceSubmitResult.syncedOnline
        ? 'Absensi berhasil disimpan ke server'
        : 'Absensi tersimpan offline — akan disinkronisasi saat online';

    final icon = result == AttendanceSubmitResult.syncedOnline
        ? Icons.cloud_done
        : Icons.save;

    final color = result == AttendanceSubmitResult.syncedOnline
        ? Colors.green
        : Colors.orange;

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            Icon(icon, color: Colors.white, size: 20),
            const SizedBox(width: 8),
            Expanded(child: Text(message)),
          ],
        ),
        backgroundColor: color,
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 3),
      ),
    );

    // Pop back to home after successful save
    Future.delayed(const Duration(milliseconds: 500), () {
      if (mounted) {
        Navigator.of(context).pop();
      }
    });
  }
}

/// A single row for student attendance input.
class _StudentAttendanceRow extends StatefulWidget {
  const _StudentAttendanceRow({
    required this.student,
    required this.index,
    required this.onStatusChanged,
    required this.onKeteranganChanged,
  });

  final StudentAttendance student;
  final int index;
  final void Function(String status) onStatusChanged;
  final void Function(String? keterangan) onKeteranganChanged;

  @override
  State<_StudentAttendanceRow> createState() => _StudentAttendanceRowState();
}

class _StudentAttendanceRowState extends State<_StudentAttendanceRow> {
  bool _showKeterangan = false;
  final _keteranganController = TextEditingController();

  @override
  void dispose() {
    _keteranganController.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant _StudentAttendanceRow oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Show keterangan field if status is izin or sakit
    final status = widget.student.status;
    final needsKeterangan = status == 'izin' || status == 'sakit';
    if (_showKeterangan != needsKeterangan) {
      setState(() => _showKeterangan = needsKeterangan);
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = AttendanceStatus.fromValue(widget.student.status);

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(
        border: Border.all(
          color: _borderColor(status),
          width: status != null ? 1.5 : 1.0,
        ),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
            child: Row(
              children: [
                // Student number
                Container(
                  width: 28,
                  height: 28,
                  decoration: BoxDecoration(
                    color: Colors.grey.shade200,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Center(
                    child: Text(
                      '${widget.index}',
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 10),

                // Student name
                Expanded(
                  child: Text(
                    widget.student.nama,
                    style: const TextStyle(fontSize: 14),
                  ),
                ),
              ],
            ),
          ),

          // Status chips
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
            child: Row(
              children: AttendanceStatus.values.map((s) {
                final isSelected = status == s;
                return Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 2),
                    child: _StatusChip(
                      label: s.label,
                      isSelected: isSelected,
                      color: _statusColor(s),
                      onTap: () {
                        widget.onStatusChanged(s.value);
                      },
                    ),
                  ),
                );
              }).toList(),
            ),
          ),

          // Keterangan field (for izin/sakit)
          if (_showKeterangan)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
              child: TextField(
                controller: _keteranganController,
                decoration: InputDecoration(
                  hintText: 'Keterangan (opsional)',
                  isDense: true,
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 8,
                  ),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(6),
                  ),
                ),
                style: const TextStyle(fontSize: 13),
                onChanged: widget.onKeteranganChanged,
              ),
            ),
        ],
      ),
    );
  }

  Color _borderColor(AttendanceStatus? status) {
    if (status == null) return Colors.grey.shade300;
    return _statusColor(status).withOpacity(0.5);
  }

  Color _statusColor(AttendanceStatus status) {
    switch (status) {
      case AttendanceStatus.hadir:
        return Colors.green;
      case AttendanceStatus.izin:
        return Colors.blue;
      case AttendanceStatus.sakit:
        return Colors.orange;
      case AttendanceStatus.alpa:
        return Colors.red;
    }
  }
}

/// A small chip widget for selecting attendance status.
class _StatusChip extends StatelessWidget {
  const _StatusChip({
    required this.label,
    required this.isSelected,
    required this.color,
    required this.onTap,
  });

  final String label;
  final bool isSelected;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 6),
        decoration: BoxDecoration(
          color: isSelected ? color.withOpacity(0.15) : Colors.grey.shade100,
          borderRadius: BorderRadius.circular(6),
          border: Border.all(
            color: isSelected ? color : Colors.grey.shade300,
            width: isSelected ? 1.5 : 1.0,
          ),
        ),
        child: Center(
          child: Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
              color: isSelected ? color : Colors.grey.shade600,
            ),
          ),
        ),
      ),
    );
  }
}
