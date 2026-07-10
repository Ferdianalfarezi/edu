import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../models/tagihan_models.dart';
import '../providers/tagihan_provider.dart';
import '../widgets/payment_upload_overlay.dart';
import '../widgets/payment_success_overlay.dart';

/// Upload bukti transfer screen.
///
/// Features:
/// - Image picker (camera or gallery) — Requirement 11.4
/// - Preview selected image
/// - Input nominal_bayar with validation
/// - Submit via multipart POST
/// - Success/error feedback — Requirement 11.6
///
/// Validations (client-side):
/// - File format: JPG/PNG only — Requirement 11.5
/// - File size: max 5MB — Requirement 11.5
/// - nominal_bayar >= Rp 10.000 — Requirement 11.9, 11.11
/// - nominal_bayar <= sisa tagihan — Requirement 11.10, 11.12
/// - If already 1 cicilan, nominal_bayar must equal sisa — Requirement 11.14
///
/// Requirements: 11.1–11.17
class UploadBuktiScreen extends ConsumerStatefulWidget {
  const UploadBuktiScreen({super.key, required this.tagihan});

  final Tagihan tagihan;

  @override
  ConsumerState<UploadBuktiScreen> createState() => _UploadBuktiScreenState();
}

class _UploadBuktiScreenState extends ConsumerState<UploadBuktiScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nominalController = TextEditingController();
  final _imagePicker = ImagePicker();

  File? _selectedImage;
  String? _imageError;

  @override
  void dispose() {
    _nominalController.dispose();
    super.dispose();
  }

  int get _sisaTagihan => widget.tagihan.sisa;

  Future<void> _pickImage(ImageSource source) async {
    try {
      final picked = await _imagePicker.pickImage(
        source: source,
        maxWidth: 1280,
        maxHeight: 1280,
        imageQuality: 70,
      );

      if (picked == null) return;

      final file = File(picked.path);
      final extension = picked.path.split('.').last.toLowerCase();

      // Validate format (Requirement 11.5)
      if (!['jpg', 'jpeg', 'png'].contains(extension)) {
        setState(() {
          _imageError = 'Format file harus JPG atau PNG.';
          _selectedImage = null;
        });
        return;
      }

      // Validate size (Requirement 11.5)
      final fileSize = await file.length();
      if (fileSize > 5 * 1024 * 1024) {
        setState(() {
          _imageError = 'Ukuran file maksimal 5MB.';
          _selectedImage = null;
        });
        return;
      }

      setState(() {
        _selectedImage = file;
        _imageError = null;
      });
    } on PlatformException catch (e) {
      setState(() {
        _imageError = 'Gagal mengakses kamera/galeri: ${e.message}';
      });
    }
  }

  void _showImageSourceDialog() {
    showModalBottomSheet(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.camera_alt),
              title: const Text('Kamera'),
              onTap: () {
                Navigator.pop(context);
                _pickImage(ImageSource.camera);
              },
            ),
            ListTile(
              leading: const Icon(Icons.photo_library),
              title: const Text('Galeri'),
              onTap: () {
                Navigator.pop(context);
                _pickImage(ImageSource.gallery);
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _submit() async {
    // Validate form
    if (!_formKey.currentState!.validate()) return;

    // Validate image selected
    if (_selectedImage == null) {
      setState(() {
        _imageError = 'Pilih foto bukti transfer terlebih dahulu.';
      });
      return;
    }

    final nominalText =
        _nominalController.text.replaceAll(RegExp(r'[^0-9]'), '');
    final nominalBayar = int.tryParse(nominalText) ?? 0;

    // Show the animated upload overlay
    PaymentUploadOverlay.show(context);

    final result = await ref.read(uploadBuktiProvider.notifier).upload(
          tagihanId: widget.tagihan.id,
          imageFile: _selectedImage!,
          nominalBayar: nominalBayar,
          sisaTagihan: _sisaTagihan,
        );

    if (!mounted) return;

    // Dismiss overlay
    PaymentUploadOverlay.dismiss(context);

    if (result.success) {
      // Show success animation before popping (Requirement 11.6)
      await PaymentSuccessOverlay.show(context, message: result.message);

      if (!mounted) return;

      // Invalidate tagihan cache so list refreshes
      ref.invalidate(childTagihanProvider(widget.tagihan.siswaId));
      Navigator.of(context).pop();
    } else {
      // Show error
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(result.message ?? 'Gagal mengupload.'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final uploadState = ref.watch(uploadBuktiProvider);
    final isLoading = uploadState is AsyncLoading;
    final currencyFormat =
        NumberFormat.currency(locale: 'id_ID', symbol: 'Rp ', decimalDigits: 0);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Upload Bukti Transfer'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Tagihan info card
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Tagihan: ${_monthName(widget.tagihan.bulan)} ${widget.tagihan.tahun}',
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Nominal: ${currencyFormat.format(widget.tagihan.nominal)}',
                      ),
                      if (widget.tagihan.totalDibayar > 0)
                        Text(
                          'Sudah dibayar: ${currencyFormat.format(widget.tagihan.totalDibayar)}',
                        ),
                      Text(
                        // Requirement 11.3: show sisa
                        'Sisa: ${currencyFormat.format(_sisaTagihan)}',
                        style: TextStyle(
                          fontWeight: FontWeight.w600,
                          color: Colors.red.shade700,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 20),

              // Image picker section
              Text(
                'Bukti Transfer',
                style: Theme.of(context).textTheme.titleSmall,
              ),
              const SizedBox(height: 8),
              GestureDetector(
                onTap: isLoading ? null : _showImageSourceDialog,
                child: Container(
                  height: 200,
                  decoration: BoxDecoration(
                    border: Border.all(
                      color: _imageError != null
                          ? Colors.red
                          : Colors.grey.shade400,
                      width: 1.5,
                    ),
                    borderRadius: BorderRadius.circular(12),
                    color: Colors.grey.shade100,
                  ),
                  child: _selectedImage != null
                      ? ClipRRect(
                          borderRadius: BorderRadius.circular(11),
                          child: Image.file(
                            _selectedImage!,
                            fit: BoxFit.cover,
                            width: double.infinity,
                          ),
                        )
                      : Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              Icons.add_photo_alternate_outlined,
                              size: 48,
                              color: Colors.grey.shade500,
                            ),
                            const SizedBox(height: 8),
                            Text(
                              'Tap untuk memilih foto',
                              style: TextStyle(color: Colors.grey.shade600),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              'JPG/PNG, maks 5MB',
                              style: TextStyle(
                                fontSize: 12,
                                color: Colors.grey.shade500,
                              ),
                            ),
                          ],
                        ),
                ),
              ),
              if (_imageError != null)
                Padding(
                  padding: const EdgeInsets.only(top: 6, left: 12),
                  child: Text(
                    _imageError!,
                    style: TextStyle(
                      fontSize: 12,
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                ),
              if (_selectedImage != null)
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton.icon(
                    onPressed: isLoading ? null : _showImageSourceDialog,
                    icon: const Icon(Icons.refresh, size: 16),
                    label: const Text('Ganti Foto'),
                  ),
                ),
              const SizedBox(height: 20),

              // Nominal bayar input (Requirement 11.2)
              TextFormField(
                controller: _nominalController,
                keyboardType: TextInputType.number,
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  _CurrencyInputFormatter(),
                ],
                decoration: InputDecoration(
                  labelText: 'Nominal Bayar',
                  prefixText: 'Rp ',
                  border: const OutlineInputBorder(),
                  helperText:
                      'Sisa tagihan: ${currencyFormat.format(_sisaTagihan)}',
                ),
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return 'Nominal bayar wajib diisi.';
                  }
                  final numStr = value.replaceAll(RegExp(r'[^0-9]'), '');
                  final nominal = int.tryParse(numStr) ?? 0;

                  // Requirement 11.9, 11.11
                  if (nominal < 10000) {
                    return 'Nominal pembayaran minimal Rp 10.000';
                  }

                  // Requirement 11.10, 11.12
                  if (nominal > _sisaTagihan) {
                    return 'Nominal melebihi sisa tagihan';
                  }

                  return null;
                },
              ),
              const SizedBox(height: 24),

              // Submit button
              FilledButton(
                onPressed: isLoading ? null : _submit,
                child: isLoading
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Text('Kirim Bukti Transfer'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _monthName(int month) {
    const names = [
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
    return names[month - 1];
  }
}

/// Input formatter that adds thousand separators for currency display.
class _CurrencyInputFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    if (newValue.text.isEmpty) {
      return newValue;
    }

    final digitsOnly = newValue.text.replaceAll(RegExp(r'[^0-9]'), '');
    if (digitsOnly.isEmpty) {
      return const TextEditingValue(text: '');
    }

    final number = int.parse(digitsOnly);
    final formatted = NumberFormat('#,###', 'id_ID').format(number);

    return TextEditingValue(
      text: formatted,
      selection: TextSelection.collapsed(offset: formatted.length),
    );
  }
}
