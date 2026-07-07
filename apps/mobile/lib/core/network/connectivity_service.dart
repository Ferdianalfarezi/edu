import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Monitors network connectivity status.
///
/// Exposes a stream of connectivity changes and a synchronous check
/// of the current status. Used by the sync queue to trigger sync when
/// connectivity is restored, and by UI to show online/offline banners.
class ConnectivityService {
  ConnectivityService({Connectivity? connectivity})
      : _connectivity = connectivity ?? Connectivity();

  final Connectivity _connectivity;

  StreamSubscription<List<ConnectivityResult>>? _subscription;
  bool _isOnline = true;

  /// Whether the device currently has network access.
  bool get isOnline => _isOnline;

  /// Stream of connectivity status changes.
  Stream<bool> get onConnectivityChanged =>
      _connectivity.onConnectivityChanged.map((results) {
        _isOnline = !results.contains(ConnectivityResult.none);
        return _isOnline;
      });

  /// Check current connectivity status.
  Future<bool> checkConnectivity() async {
    final results = await _connectivity.checkConnectivity();
    _isOnline = !results.contains(ConnectivityResult.none);
    return _isOnline;
  }

  /// Start listening for connectivity changes.
  void startListening(void Function(bool isOnline) onChanged) {
    _subscription = _connectivity.onConnectivityChanged.listen((results) {
      _isOnline = !results.contains(ConnectivityResult.none);
      onChanged(_isOnline);
    });
  }

  /// Stop listening for connectivity changes.
  void dispose() {
    _subscription?.cancel();
  }
}

/// Riverpod provider for connectivity status as a stream.
final connectivityStreamProvider = StreamProvider<bool>((ref) {
  final service = ref.watch(connectivityServiceProvider);
  return service.onConnectivityChanged;
});

/// Provider for the connectivity service instance.
final connectivityServiceProvider = Provider<ConnectivityService>((ref) {
  final service = ConnectivityService();
  ref.onDispose(() => service.dispose());
  return service;
});
