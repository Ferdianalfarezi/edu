import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../models/rpp_models.dart';
import '../providers/rpp_provider.dart';

/// Screen for creating a new RPP (Modul Ajar).
///
/// Requirements: 41.1–41.10
/// - Two input modes: rich text or file upload (41.1)
/// - Required metadata: judul, mata_pelajaran, kategori, tahun_terbit (41.2)
/// - Searchable kategori dropdown with auto-create (41.3)
/// - Save as draft or publish (41.5)
/// - File upload max 10MB, PDF/DOC/DOCX (41.10)
class RppCreateScreen extends ConsumerStatefulWidget {
  const RppCreateScreen({super.key});

  @override
  ConsumerState<RppCreateScreen> createState() => _RppCreateScreenState();
}

class _RppCreateScreenState extends ConsumerState<RppCreateScreen> {
  final _formKey = GlobalKey<FormState>();
  final _judulController = TextEditingController();
  final _kontenController = TextEditingController();
  final _kategoriController = TextEditingController();

  String? _selectedMapelId;
  int _tahunTerbit = DateTime.now().year;
  bool _isFileMode = false;
  String? _selectedFilePath;
  String? _selectedFileName;
  bool _isSubmitting = false;

  @override
  void dispose() {
    _judulController.dispose();
    _kontenController.dispose();
    _kategoriController.dispose();
    super.dispose();
  }

  Future<void> _pickFile() async {
    // File picker implementation — uses platform file picker
    // In a real implementation, we'd use file_picker package.
    // For now, we show a dialog indicating the action.
    // The actual file picking requires the file_picker dependency.
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(
          'File picker: pilih file PDF, DOC, atau DOCX (maks 10MB)',
        ),
      ),
    );
    // TODO: Integrate file_picker package when added to dependencies
    // final result = await FilePicker.platform.pickFiles(
    //   type: FileType.custom,
    //   allowedExtensions: ['pdf', 'doc', 'docx'],
    // );
    // if (result != null && result.files.single.path != null) {
    //   final file = result.files.single;
    //   if (file.size > 10 * 1024 * 1024) {
    //     // 10MB limit (Req 41.10)
    //     ScaffoldMessenger.of(context).showSnackBar(
    //       const SnackBar(content: Text('File melebihi batas 10MB')),
    //     );
    //     return;
    //   }
    //   setState(() {
    //     _selectedFilePath = file.path;
    //     _selectedFileName = file.name;
    //   });
    // }
  }

  Future<void> _submit({required String status}) async {
    if (!_formKey.currentState!.validate()) return;

    if (_isFileMode && _selectedFilePath == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Silakan pilih file untuk diupload')),
      );
      return;
    }

    if (!_isFileMode && _kontenController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Silakan isi konten RPP')),
      );
      return;
    }

    setState(() => _isSubmitting = true);

    try {
      await createRpp(
        ref: ref,
        judul: _judulController.text.trim(),
        mataPelajaranId: _selectedMapelId!,
        kategori: _kategoriController.text.trim(),
        tahunTerbit: _tahunTerbit,
        kontenType: _isFileMode ? 'file' : 'richtext',
        status: status,
        konten: _isFileMode ? null : _kontenController.text.trim(),
        filePath: _isFileMode ? _selectedFilePath : null,
        fileName: _isFileMode ? _selectedFileName : null,
      );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              status == 'draft'
                  ? 'RPP berhasil disimpan sebagai draft'
                  : 'RPP berhasil dipublish',
            ),
          ),
        );
        ref.invalidate(rppListProvider);
        context.pop();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Gagal menyimpan RPP: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final mapelAsync = ref.watch(mapelOptionsProvider);
    final kategoriAsync = ref.watch(kategoriOptionsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Buat RPP Baru'),
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Judul (Req 41.2)
            TextFormField(
              controller: _judulController,
              decoration: const InputDecoration(
                labelText: 'Judul RPP *',
                border: OutlineInputBorder(),
              ),
              validator: (value) {
                if (value == null || value.trim().isEmpty) {
                  return 'Judul wajib diisi';
                }
                return null;
              },
            ),
            const SizedBox(height: 16),

            // Mata Pelajaran dropdown (Req 41.2)
            mapelAsync.when(
              data: (mapelList) => DropdownButtonFormField<String>(
                initialValue: _selectedMapelId,
                decoration: const InputDecoration(
                  labelText: 'Mata Pelajaran *',
                  border: OutlineInputBorder(),
                ),
                items: mapelList
                    .map((m) => DropdownMenuItem(
                          value: m.id,
                          child: Text(m.nama),
                        ))
                    .toList(),
                onChanged: (value) => setState(() => _selectedMapelId = value),
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return 'Mata pelajaran wajib dipilih';
                  }
                  return null;
                },
              ),
              loading: () => const LinearProgressIndicator(),
              error: (_, __) => const Text('Gagal memuat mata pelajaran'),
            ),
            const SizedBox(height: 16),

            // Kategori — searchable text input with autocomplete (Req 41.3)
            kategoriAsync.when(
              data: (kategoriList) => Autocomplete<KategoriOption>(
                optionsBuilder: (textEditingValue) {
                  if (textEditingValue.text.isEmpty) {
                    return kategoriList;
                  }
                  return kategoriList.where((k) => k.nama
                      .toLowerCase()
                      .contains(textEditingValue.text.toLowerCase()));
                },
                displayStringForOption: (option) => option.nama,
                fieldViewBuilder:
                    (context, controller, focusNode, onSubmitted) {
                  // Sync the text controller
                  controller.addListener(() {
                    _kategoriController.text = controller.text;
                  });
                  return TextFormField(
                    controller: controller,
                    focusNode: focusNode,
                    decoration: const InputDecoration(
                      labelText: 'Kategori *',
                      border: OutlineInputBorder(),
                      helperText: 'Ketik untuk mencari atau buat kategori baru',
                    ),
                    validator: (value) {
                      if (value == null || value.trim().isEmpty) {
                        return 'Kategori wajib diisi';
                      }
                      return null;
                    },
                  );
                },
                onSelected: (option) {
                  _kategoriController.text = option.nama;
                },
              ),
              loading: () => const LinearProgressIndicator(),
              error: (_, __) => TextFormField(
                controller: _kategoriController,
                decoration: const InputDecoration(
                  labelText: 'Kategori *',
                  border: OutlineInputBorder(),
                ),
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return 'Kategori wajib diisi';
                  }
                  return null;
                },
              ),
            ),
            const SizedBox(height: 16),

            // Tahun Terbit (Req 41.2)
            DropdownButtonFormField<int>(
              initialValue: _tahunTerbit,
              decoration: const InputDecoration(
                labelText: 'Tahun Terbit *',
                border: OutlineInputBorder(),
              ),
              items: List.generate(5, (i) => DateTime.now().year - i)
                  .map((year) => DropdownMenuItem(
                        value: year,
                        child: Text('$year'),
                      ))
                  .toList(),
              onChanged: (value) {
                if (value != null) setState(() => _tahunTerbit = value);
              },
            ),
            const SizedBox(height: 24),

            // Content type toggle (Req 41.1)
            const Text(
              'Jenis Konten',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            SegmentedButton<bool>(
              segments: const [
                ButtonSegment(
                  value: false,
                  label: Text('Tulis Teks'),
                  icon: Icon(Icons.edit_note),
                ),
                ButtonSegment(
                  value: true,
                  label: Text('Upload File'),
                  icon: Icon(Icons.upload_file),
                ),
              ],
              selected: {_isFileMode},
              onSelectionChanged: (selected) {
                setState(() => _isFileMode = selected.first);
              },
            ),
            const SizedBox(height: 16),

            // Content area
            if (_isFileMode) ...[
              // File upload mode (Req 41.1b, 41.10)
              _FileUploadSection(
                selectedFileName: _selectedFileName,
                onPickFile: _pickFile,
                onClearFile: () {
                  setState(() {
                    _selectedFilePath = null;
                    _selectedFileName = null;
                  });
                },
              ),
            ] else ...[
              // Text input mode (Req 41.1a)
              TextFormField(
                controller: _kontenController,
                decoration: const InputDecoration(
                  labelText: 'Konten RPP',
                  border: OutlineInputBorder(),
                  alignLabelWithHint: true,
                  hintText: 'Tulis isi RPP / Modul Ajar di sini...',
                ),
                maxLines: 12,
                minLines: 6,
              ),
            ],

            const SizedBox(height: 32),

            // Action buttons (Req 41.5)
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed:
                        _isSubmitting ? null : () => _submit(status: 'draft'),
                    icon: const Icon(Icons.save_outlined),
                    label: const Text('Simpan Draft'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: _isSubmitting
                        ? null
                        : () => _submit(status: 'published'),
                    icon: const Icon(Icons.publish),
                    label: const Text('Publish'),
                  ),
                ),
              ],
            ),

            if (_isSubmitting) ...[
              const SizedBox(height: 16),
              const LinearProgressIndicator(),
            ],
          ],
        ),
      ),
    );
  }
}

/// File upload section widget.
class _FileUploadSection extends StatelessWidget {
  const _FileUploadSection({
    required this.selectedFileName,
    required this.onPickFile,
    required this.onClearFile,
  });

  final String? selectedFileName;
  final VoidCallback onPickFile;
  final VoidCallback onClearFile;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        border: Border.all(color: Colors.grey.shade300),
        borderRadius: BorderRadius.circular(12),
        color: Colors.grey.shade50,
      ),
      child: Column(
        children: [
          if (selectedFileName != null) ...[
            Row(
              children: [
                const Icon(Icons.insert_drive_file, color: Colors.blue),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    selectedFileName!,
                    style: const TextStyle(fontWeight: FontWeight.w500),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: onClearFile,
                ),
              ],
            ),
          ] else ...[
            Icon(
              Icons.cloud_upload_outlined,
              size: 48,
              color: Colors.grey.shade400,
            ),
            const SizedBox(height: 12),
            const Text(
              'Upload file RPP',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w500),
            ),
            const SizedBox(height: 4),
            Text(
              'Format: PDF, DOC, DOCX • Maks 10MB',
              style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
            ),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: onPickFile,
              icon: const Icon(Icons.attach_file),
              label: const Text('Pilih File'),
            ),
          ],
        ],
      ),
    );
  }
}
