import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/di/providers.dart';
import '../../../core/router/app_router.dart';
import '../widgets/change_password_dialog.dart';

/// Login screen with two modes:
/// - Guru: email + password (Requirement 19.10)
/// - Orang Tua: phone number only, no password (Requirement 19.2)
///
/// After successful login, role is detected from JWT and
/// the router redirects to the appropriate UI (Requirement 19.11).
///
/// Handles must_change_password flag for guru first login (Requirement 18.9).
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  bool _isGuruMode = true;
  bool _isLoading = false;
  String? _errorMessage;
  bool _obscurePassword = true;

  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _phoneController = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final authNotifier = ref.read(authStateProvider.notifier);

      if (_isGuruMode) {
        await authNotifier.loginAsGuru(
          email: _emailController.text.trim(),
          password: _passwordController.text,
        );
      } else {
        await authNotifier.loginAsOrangTua(
          phone: _phoneController.text.trim(),
        );
      }

      // Check if user must change password before proceeding
      final authState = ref.read(authStateProvider);
      if (authState.mustChangePassword && mounted) {
        await _showChangePasswordDialog();
      }
      // Router redirect will handle navigation after state change
    } catch (e) {
      setState(() {
        _errorMessage = _parseError(e);
      });
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _showChangePasswordDialog() async {
    final result = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (context) => const ChangePasswordDialog(),
    );

    if (result == true && mounted) {
      // Password changed successfully, clear the flag
      ref.read(authStateProvider.notifier).clearMustChangePassword();
    } else if (mounted) {
      // User cancelled — log them out since they can't proceed
      await ref.read(authStateProvider.notifier).logout();
    }
  }

  String _parseError(Object error) {
    if (error is DioException) {
      final statusCode = error.response?.statusCode;
      final responseData = error.response?.data;

      // Extract server error message if available
      String? serverMessage;
      if (responseData is Map<String, dynamic>) {
        serverMessage = responseData['message'] as String?;
      }

      switch (statusCode) {
        case 401:
          return serverMessage ??
              (_isGuruMode
                  ? 'Email atau password salah'
                  : 'Nomor tidak terdaftar, hubungi admin sekolah');
        case 423:
          return 'Akun terkunci. Coba lagi dalam 15 menit.';
        case 429:
          return 'Terlalu banyak percobaan, coba lagi nanti';
        case 403:
          return 'Akses ditolak';
        default:
          if (error.type == DioExceptionType.connectionTimeout ||
              error.type == DioExceptionType.receiveTimeout ||
              error.type == DioExceptionType.sendTimeout) {
            return 'Koneksi timeout. Periksa internet Anda.';
          }
          if (error.type == DioExceptionType.connectionError) {
            return 'Tidak dapat terhubung ke server. Periksa koneksi internet.';
          }
          return serverMessage ?? 'Terjadi kesalahan. Silakan coba lagi.';
      }
    }

    // Generic fallback
    final errorStr = error.toString();
    if (errorStr.contains('SocketException') ||
        errorStr.contains('Connection refused')) {
      return 'Tidak dapat terhubung ke server. Periksa koneksi internet.';
    }
    return 'Terjadi kesalahan. Silakan coba lagi.';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Form(
              key: _formKey,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Icon(
                    Icons.school_rounded,
                    size: 64,
                    color: Color(0xFF1565C0),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'Edu School',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Masuk ke akun Anda',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 14,
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 32),

                  // Role toggle
                  SegmentedButton<bool>(
                    segments: const [
                      ButtonSegment(
                        value: true,
                        label: Text('Guru'),
                        icon: Icon(Icons.person),
                      ),
                      ButtonSegment(
                        value: false,
                        label: Text('Orang Tua'),
                        icon: Icon(Icons.family_restroom),
                      ),
                    ],
                    selected: {_isGuruMode},
                    onSelectionChanged: (selected) {
                      setState(() {
                        _isGuruMode = selected.first;
                        _errorMessage = null;
                      });
                    },
                  ),
                  const SizedBox(height: 24),

                  // Form fields based on mode
                  if (_isGuruMode) ...[
                    TextFormField(
                      controller: _emailController,
                      keyboardType: TextInputType.emailAddress,
                      textInputAction: TextInputAction.next,
                      autofillHints: const [AutofillHints.email],
                      decoration: const InputDecoration(
                        labelText: 'Email',
                        prefixIcon: Icon(Icons.email_outlined),
                        border: OutlineInputBorder(),
                      ),
                      validator: _validateEmail,
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _passwordController,
                      obscureText: _obscurePassword,
                      textInputAction: TextInputAction.done,
                      autofillHints: const [AutofillHints.password],
                      onFieldSubmitted: (_) => _handleLogin(),
                      decoration: InputDecoration(
                        labelText: 'Password',
                        prefixIcon: const Icon(Icons.lock_outlined),
                        border: const OutlineInputBorder(),
                        suffixIcon: IconButton(
                          icon: Icon(
                            _obscurePassword
                                ? Icons.visibility_off_outlined
                                : Icons.visibility_outlined,
                          ),
                          onPressed: () {
                            setState(() {
                              _obscurePassword = !_obscurePassword;
                            });
                          },
                        ),
                      ),
                      validator: _validatePassword,
                    ),
                  ] else ...[
                    TextFormField(
                      controller: _phoneController,
                      keyboardType: TextInputType.phone,
                      textInputAction: TextInputAction.done,
                      autofillHints: const [AutofillHints.telephoneNumber],
                      onFieldSubmitted: (_) => _handleLogin(),
                      decoration: const InputDecoration(
                        labelText: 'Nomor Telepon',
                        prefixIcon: Icon(Icons.phone_outlined),
                        border: OutlineInputBorder(),
                        hintText: '08xxxxxxxxxx',
                        helperText: 'Masukkan nomor yang didaftarkan oleh sekolah',
                      ),
                      validator: _validatePhone,
                    ),
                  ],

                  // Error message
                  if (_errorMessage != null) ...[
                    const SizedBox(height: 16),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.errorContainer,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            Icons.error_outline,
                            color: theme.colorScheme.onErrorContainer,
                            size: 20,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              _errorMessage!,
                              style: TextStyle(
                                color: theme.colorScheme.onErrorContainer,
                                fontSize: 14,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                  const SizedBox(height: 24),

                  // Login button
                  FilledButton(
                    onPressed: _isLoading ? null : _handleLogin,
                    style: FilledButton.styleFrom(
                      minimumSize: const Size.fromHeight(48),
                    ),
                    child: _isLoading
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Text(
                            'Masuk',
                            style: TextStyle(fontSize: 16),
                          ),
                  ),

                  // Reset password link (guru only)
                  if (_isGuruMode) ...[
                    const SizedBox(height: 12),
                    TextButton(
                      onPressed: _isLoading
                          ? null
                          : () => context.push(AppRoutes.forgotPassword),
                      child: const Text('Lupa Password?'),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  String? _validateEmail(String? value) {
    if (value == null || value.trim().isEmpty) {
      return 'Email wajib diisi';
    }
    // Basic email format validation
    final emailRegex = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');
    if (!emailRegex.hasMatch(value.trim())) {
      return 'Format email tidak valid';
    }
    return null;
  }

  String? _validatePassword(String? value) {
    if (value == null || value.isEmpty) {
      return 'Password wajib diisi';
    }
    if (value.length < 6) {
      return 'Password minimal 6 karakter';
    }
    return null;
  }

  String? _validatePhone(String? value) {
    if (value == null || value.trim().isEmpty) {
      return 'Nomor telepon wajib diisi';
    }
    final cleaned = value.trim().replaceAll(RegExp(r'[\s\-()]'), '');
    if (cleaned.length < 10) {
      return 'Nomor telepon minimal 10 digit';
    }
    if (cleaned.length > 15) {
      return 'Nomor telepon maksimal 15 digit';
    }
    // Must start with 0 or + (Indonesian numbers)
    if (!RegExp(r'^[0+]\d+$').hasMatch(cleaned)) {
      return 'Format nomor telepon tidak valid';
    }
    return null;
  }
}
