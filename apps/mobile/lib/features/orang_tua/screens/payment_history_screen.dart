import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/tagihan_models.dart';
import '../providers/tagihan_provider.dart';

/// Payment history screen for a specific tagihan.
///
/// Displays:
/// - Tagihan header info (bulan, nominal, status)
/// - List of transactions for this tagihan
/// - Each transaction: jumlah, tanggal, status (menunggu/diterima/ditolak), alasan if rejected
/// - Download receipt button for approved transactions
///
/// Requirements: 14.2, 14.4, 14.5, 14.6
class PaymentHistoryScreen extends ConsumerWidget {
  const PaymentHistoryScreen({super.key, required this.tagihan});

  final Tagihan tagihan;

  static const _monthNames = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final riwayatAsync = ref.watch(tagihanRiwayatProvider(tagihan.id));
    final currencyFormat =
        NumberFormat.currency(locale: 'id_ID', symbol: 'Rp ', decimalDigits: 0);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Riwayat Pembayaran'),
      ),
      body: Column(
        children: [
          // Tagihan summary header
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surfaceContainerHighest,
              border: Border(
                bottom: BorderSide(
                  color: Theme.of(context).dividerColor,
                  width: 0.5,
                ),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${_monthNames[tagihan.bulan - 1]} ${tagihan.tahun}',
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 6),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Nominal: ${currencyFormat.format(tagihan.nominal)}'),
                    _StatusChip(status: tagihan.status),
                  ],
                ),
                if (tagihan.totalDibayar > 0) ...[
                  const SizedBox(height: 4),
                  Text('Dibayar: ${currencyFormat.format(tagihan.totalDibayar)}'),
                ],
                if (tagihan.sisa > 0 && tagihan.status != TagihanStatus.lunas) ...[
                  const SizedBox(height: 4),
                  Text(
                    'Sisa: ${currencyFormat.format(tagihan.sisa)}',
                    style: TextStyle(
                      color: Colors.red.shade700,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ],
            ),
          ),

          // Transactions list
          Expanded(
            child: riwayatAsync.when(
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
                        'Gagal memuat riwayat pembayaran',
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                      const SizedBox(height: 8),
                      TextButton(
                        onPressed: () =>
                            ref.invalidate(tagihanRiwayatProvider(tagihan.id)),
                        child: const Text('Coba Lagi'),
                      ),
                    ],
                  ),
                ),
              ),
              data: (transactions) {
                if (transactions.isEmpty) {
                  return const Center(
                    child: Padding(
                      padding: EdgeInsets.all(24),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.receipt_long_outlined,
                              size: 48, color: Colors.grey),
                          SizedBox(height: 12),
                          Text('Belum ada riwayat pembayaran.'),
                        ],
                      ),
                    ),
                  );
                }

                return ListView.separated(
                  padding: const EdgeInsets.all(12),
                  itemCount: transactions.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (context, index) {
                    return _TransactionCard(
                      transaction: transactions[index],
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

/// Status chip matching the tagihan status (for the header).
class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});

  final TagihanStatus status;

  Color _color() {
    switch (status) {
      case TagihanStatus.belumBayar:
        return Colors.orange;
      case TagihanStatus.menungguVerifikasi:
        return Colors.blue;
      case TagihanStatus.cicilan:
        return Colors.amber.shade700;
      case TagihanStatus.lunas:
        return Colors.green;
      case TagihanStatus.ditolak:
        return Colors.red;
      case TagihanStatus.dibatalkan:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Chip(
      label: Text(
        status.label,
        style: const TextStyle(fontSize: 12, color: Colors.white),
      ),
      backgroundColor: _color(),
      padding: EdgeInsets.zero,
      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
      visualDensity: VisualDensity.compact,
    );
  }
}

/// A single transaction card in the payment history list.
class _TransactionCard extends ConsumerWidget {
  const _TransactionCard({required this.transaction});

  final TagihanTransaksi transaction;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currencyFormat =
        NumberFormat.currency(locale: 'id_ID', symbol: 'Rp ', decimalDigits: 0);
    final dateFormat = DateFormat('dd MMM yyyy, HH:mm', 'id_ID');

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Amount and status
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  currencyFormat.format(transaction.jumlahBayar),
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                _TransaksiStatusBadge(status: transaction.status),
              ],
            ),
            const SizedBox(height: 8),

            // Date
            Row(
              children: [
                Icon(Icons.access_time, size: 14, color: Colors.grey.shade600),
                const SizedBox(width: 4),
                Text(
                  dateFormat.format(transaction.createdAt),
                  style: TextStyle(fontSize: 13, color: Colors.grey.shade700),
                ),
              ],
            ),

            // Method
            if (transaction.metode.isNotEmpty) ...[
              const SizedBox(height: 4),
              Row(
                children: [
                  Icon(Icons.payment, size: 14, color: Colors.grey.shade600),
                  const SizedBox(width: 4),
                  Text(
                    _metodeLabel(transaction.metode),
                    style: TextStyle(fontSize: 13, color: Colors.grey.shade700),
                  ),
                ],
              ),
            ],

            // Reference number (Requirement 14.4)
            if (transaction.nomorReferensi != null) ...[
              const SizedBox(height: 4),
              Row(
                children: [
                  Icon(Icons.tag, size: 14, color: Colors.grey.shade600),
                  const SizedBox(width: 4),
                  Text(
                    'Ref: ${transaction.nomorReferensi}',
                    style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                  ),
                ],
              ),
            ],

            // Rejection reason (Requirement 14.2: show alasan if rejected)
            if (transaction.status == TransaksiStatus.rejected &&
                transaction.alasanPenolakan != null) ...[
              const SizedBox(height: 8),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.red.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.red.shade200),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.info_outline, size: 16, color: Colors.red.shade700),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        'Alasan: ${transaction.alasanPenolakan}',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.red.shade800,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],

            // Download receipt button (Requirement 14.6)
            if (transaction.status == TransaksiStatus.approved) ...[
              const SizedBox(height: 10),
              Align(
                alignment: Alignment.centerRight,
                child: OutlinedButton.icon(
                  onPressed: () => _downloadReceipt(context, ref),
                  icon: const Icon(Icons.download, size: 16),
                  label: const Text('Unduh Bukti'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  String _metodeLabel(String metode) {
    switch (metode) {
      case 'upload_bukti':
        return 'Upload Bukti Transfer';
      case 'tunai':
        return 'Tunai';
      case 'transfer_manual':
        return 'Transfer Manual';
      default:
        return metode;
    }
  }

  Future<void> _downloadReceipt(BuildContext context, WidgetRef ref) async {
    try {
      final url =
          await ref.read(receiptUrlProvider(transaction.id).future);
      final uri = Uri.parse(url);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      } else {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Tidak dapat membuka link unduhan.')),
          );
        }
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Gagal mengunduh bukti pembayaran.')),
        );
      }
    }
  }
}

/// Color-coded badge for transaction status.
class _TransaksiStatusBadge extends StatelessWidget {
  const _TransaksiStatusBadge({required this.status});

  final TransaksiStatus status;

  Color _backgroundColor() {
    switch (status) {
      case TransaksiStatus.pending:
        return Colors.blue.shade100;
      case TransaksiStatus.approved:
        return Colors.green.shade100;
      case TransaksiStatus.rejected:
        return Colors.red.shade100;
    }
  }

  Color _textColor() {
    switch (status) {
      case TransaksiStatus.pending:
        return Colors.blue.shade900;
      case TransaksiStatus.approved:
        return Colors.green.shade900;
      case TransaksiStatus.rejected:
        return Colors.red.shade900;
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
