# Edu Mobile App

Flutter mobile application for the Edu School Management system.

## Roles

This app serves two user roles with distinct UIs:
- **Guru** (Teacher): Email + password login, attendance input with offline support, jadwal, RPP
- **Orang Tua** (Parent): Phone-based login (no password), view attendance/tagihan/rapor/notifications

## Architecture

Clean architecture with Riverpod for state management:

```
lib/
├── core/                    # App-wide infrastructure
│   ├── constants/           # API endpoints, app constants
│   ├── database/            # Drift (SQLite) local database
│   │   └── tables/          # Table definitions
│   ├── di/                  # Riverpod providers
│   ├── models/              # Core models (auth state, user role)
│   ├── network/             # Dio client, JWT interceptor, connectivity
│   ├── router/              # GoRouter with role-based routing
│   └── services/            # Auth, token storage, FCM notifications
├── features/                # Feature modules
│   ├── auth/                # Login, splash screens
│   ├── guru/                # Guru-specific screens
│   └── orang_tua/           # Orang Tua-specific screens
└── shared/                  # Shared widgets and utilities
    └── widgets/
```

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `flutter_riverpod` | State management & DI |
| `go_router` | Declarative routing with role-based redirects |
| `dio` | HTTP client with interceptors |
| `drift` | Local SQLite database (offline-first) |
| `connectivity_plus` | Network monitoring |
| `flutter_secure_storage` | Secure JWT token storage |
| `firebase_messaging` | Push notifications (FCM) |
| `jwt_decoder` | Decode JWT for role detection |

## Setup

1. Install Flutter SDK (>= 3.16.0)
2. Run `flutter pub get`
3. Run code generation: `dart run build_runner build --delete-conflicting-outputs`
4. Add Firebase config files:
   - Android: `android/app/google-services.json`
   - iOS: `ios/Runner/GoogleService-Info.plist`
5. Run: `flutter run`

## Offline Support

Guru attendance data is stored locally in Drift (SQLite) when offline.
When connectivity is restored, the sync queue automatically pushes
data to the server using `event_timestamp` for LWW conflict resolution
(per ADR-003).

## Environment Configuration

The API base URL is configured in `lib/core/constants/api_constants.dart`.
For different environments (dev/staging/prod), use `--dart-define` flags:

```bash
flutter run --dart-define=API_BASE_URL=https://api.edu-staging.example.com
```
