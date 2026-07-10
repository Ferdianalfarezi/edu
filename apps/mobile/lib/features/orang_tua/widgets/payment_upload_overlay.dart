import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';

/// Full-screen overlay shown during bukti transfer upload.
///
/// Design rationale:
/// - The upload can take 5-30s depending on network. A simple spinner is
///   anxiety-inducing because users don't know if the app is stuck.
/// - This overlay shows animated step indicators so users understand the
///   system is actively processing their payment.
/// - The overlay blocks back navigation and interaction to prevent double-submit.
///
/// Steps displayed:
/// 1. "Mengompres gambar..." (compressing)
/// 2. "Mengirim bukti transfer..." (uploading)
/// 3. "Memproses pembayaran..." (server processing)
///
/// Usage:
/// ```dart
/// PaymentUploadOverlay.show(context);
/// // ... await upload ...
/// PaymentUploadOverlay.dismiss(context);
/// ```
class PaymentUploadOverlay extends StatefulWidget {
  const PaymentUploadOverlay({super.key});

  /// Show the overlay as a full-screen route.
  static void show(BuildContext context) {
    Navigator.of(context).push(
      PageRouteBuilder(
        opaque: false,
        barrierDismissible: false,
        pageBuilder: (_, __, ___) => const PaymentUploadOverlay(),
        transitionsBuilder: (_, animation, __, child) {
          return FadeTransition(opacity: animation, child: child);
        },
        transitionDuration: const Duration(milliseconds: 200),
      ),
    );
  }

  /// Dismiss the overlay.
  static void dismiss(BuildContext context) {
    if (Navigator.of(context).canPop()) {
      Navigator.of(context).pop();
    }
  }

  @override
  State<PaymentUploadOverlay> createState() => _PaymentUploadOverlayState();
}

class _PaymentUploadOverlayState extends State<PaymentUploadOverlay>
    with TickerProviderStateMixin {
  late final AnimationController _pulseController;
  late final AnimationController _progressController;
  late final AnimationController _stepController;

  int _currentStep = 0;

  static const _steps = [
    _StepData(
      icon: Icons.compress_rounded,
      label: 'Mengompres gambar...',
      sublabel: 'Memperkecil ukuran file',
    ),
    _StepData(
      icon: Icons.cloud_upload_rounded,
      label: 'Mengirim bukti transfer...',
      sublabel: 'Mengupload ke server',
    ),
    _StepData(
      icon: Icons.verified_rounded,
      label: 'Memproses pembayaran...',
      sublabel: 'Hampir selesai',
    ),
  ];

  @override
  void initState() {
    super.initState();

    // Pulsing glow animation
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1800),
    )..repeat(reverse: true);

    // Circular progress that loops
    _progressController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2200),
    )..repeat();

    // Step advancement timer
    _stepController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 400),
    );

    _advanceSteps();
  }

  /// Advance through the visual steps on a timer to give the user
  /// a sense of progress. Steps advance every ~4s.
  Future<void> _advanceSteps() async {
    await Future.delayed(const Duration(seconds: 3));
    if (!mounted) return;

    setState(() => _currentStep = 1);
    _stepController.forward(from: 0);

    await Future.delayed(const Duration(seconds: 5));
    if (!mounted) return;

    setState(() => _currentStep = 2);
    _stepController.forward(from: 0);
  }

  @override
  void dispose() {
    _pulseController.dispose();
    _progressController.dispose();
    _stepController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // ignore: deprecated_member_use
    return PopScope(
      canPop: false,
      child: Scaffold(
        backgroundColor: Colors.black.withValues(alpha: 0.85),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 40),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Animated payment icon with glow
                _buildAnimatedIcon(),
                const SizedBox(height: 36),

                // Step indicators
                _buildStepIndicators(),
                const SizedBox(height: 28),

                // Current step label
                _buildStepLabel(),
                const SizedBox(height: 44),

                // "Jangan tutup halaman ini" notice
                _buildNotice(),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildAnimatedIcon() {
    return AnimatedBuilder(
      animation: _pulseController,
      builder: (context, child) {
        final pulseValue = _pulseController.value;
        final scale = 1.0 + (pulseValue * 0.06);
        final glowOpacity = 0.15 + (pulseValue * 0.2);

        return Transform.scale(
          scale: scale,
          child: Container(
            width: 96,
            height: 96,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: AppTheme.primaryColor.withValues(alpha: 0.12),
              boxShadow: [
                BoxShadow(
                  color: AppTheme.primaryColor.withValues(alpha: glowOpacity),
                  blurRadius: 32,
                  spreadRadius: 8,
                ),
              ],
            ),
            child: Stack(
              alignment: Alignment.center,
              children: [
                // Spinning arc behind the icon
                AnimatedBuilder(
                  animation: _progressController,
                  builder: (context, _) {
                    return CustomPaint(
                      size: const Size(80, 80),
                      painter: _ArcPainter(
                        progress: _progressController.value,
                        color: AppTheme.primaryColor,
                      ),
                    );
                  },
                ),
                // Center icon
                Icon(
                  _steps[_currentStep].icon,
                  size: 36,
                  color: Colors.white.withValues(alpha: 0.95),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildStepIndicators() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(_steps.length, (index) {
        final isActive = index == _currentStep;
        final isDone = index < _currentStep;

        return AnimatedContainer(
          duration: const Duration(milliseconds: 350),
          curve: Curves.easeOut,
          margin: const EdgeInsets.symmetric(horizontal: 4),
          width: isActive ? 28 : 8,
          height: 8,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(4),
            color: isDone
                ? AppTheme.success.withValues(alpha: 0.9)
                : isActive
                    ? AppTheme.primaryColor
                    : Colors.white.withValues(alpha: 0.2),
          ),
        );
      }),
    );
  }

  Widget _buildStepLabel() {
    final step = _steps[_currentStep];

    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 300),
      transitionBuilder: (child, animation) {
        return FadeTransition(
          opacity: animation,
          child: SlideTransition(
            position: Tween<Offset>(
              begin: const Offset(0, 0.15),
              end: Offset.zero,
            ).animate(animation),
            child: child,
          ),
        );
      },
      child: Column(
        key: ValueKey(_currentStep),
        children: [
          Text(
            step.label,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 17,
              fontWeight: FontWeight.w600,
              letterSpacing: -0.3,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            step.sublabel,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.55),
              fontSize: 13,
              fontWeight: FontWeight.w400,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildNotice() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.1),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.info_outline_rounded,
            size: 16,
            color: Colors.white.withValues(alpha: 0.5),
          ),
          const SizedBox(width: 8),
          Text(
            'Jangan tutup halaman ini',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.6),
              fontSize: 12,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}

/// Data for each step in the overlay.
class _StepData {
  const _StepData({
    required this.icon,
    required this.label,
    required this.sublabel,
  });

  final IconData icon;
  final String label;
  final String sublabel;
}

/// Custom painter for the spinning arc around the icon.
class _ArcPainter extends CustomPainter {
  _ArcPainter({required this.progress, required this.color});

  final double progress;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2 - 3;

    // Background track
    final trackPaint = Paint()
      ..color = color.withValues(alpha: 0.1)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round;

    canvas.drawCircle(center, radius, trackPaint);

    // Spinning arc
    final arcPaint = Paint()
      ..color = color.withValues(alpha: 0.8)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round;

    final startAngle = progress * 2 * math.pi;
    const sweepAngle = math.pi * 0.7;

    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      startAngle,
      sweepAngle,
      false,
      arcPaint,
    );
  }

  @override
  bool shouldRepaint(_ArcPainter oldDelegate) =>
      oldDelegate.progress != progress;
}
