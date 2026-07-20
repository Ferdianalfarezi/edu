# Tech Stack

## Monorepo Structure
- **Package manager**: pnpm (workspaces)
- **Node**: >=18.0.0

## Apps

### `apps/api` — Backend
- **Framework**: NestJS 10 (TypeScript)
- **ORM**: Drizzle ORM with PostgreSQL (`pg` driver)
- **Auth**: Passport + JWT (access + refresh tokens)
- **Queue**: Bull (Redis-backed, via `@nestjs/bull`)
- **Storage**: AWS S3 (`@aws-sdk/client-s3`)
- **Notifications**: Firebase Admin SDK (FCM push)
- **Email**: Nodemailer
- **Validation**: class-validator + class-transformer
- **Logging**: Pino (via nestjs-pino)
- **Rate limiting**: @nestjs/throttler
- **Image processing**: Sharp
- **Scheduling**: @nestjs/schedule
- **Health checks**: @nestjs/terminus

### `apps/admin` — Admin Panel (Web)
- **Framework**: Vue 3 (Composition API, `<script setup>`)
- **Build tool**: Vite 5
- **State management**: Pinia
- **Routing**: Vue Router 4
- **Styling**: Tailwind CSS 4
- **HTTP client**: Axios
- **Type checking**: vue-tsc

### `apps/mobile` — Mobile App
- **Framework**: Flutter (Dart, SDK >=3.2.0)
- **State management**: Riverpod (with code generation)
- **Navigation**: GoRouter
- **Networking**: Dio
- **Local DB (offline-first)**: Drift (SQLite)
- **Push notifications**: Firebase Messaging
- **Secure storage**: flutter_secure_storage

### `packages/shared` — Shared TypeScript Package
- Enums (Role, Platform, etc.) and interfaces shared between `api` and `admin`
- Imported as `@edu/shared`

## Database
- **PostgreSQL** with Row-Level Security (RLS) for tenant isolation
- **Drizzle schema** defined in `apps/api/src/drizzle/schema/`
- **Migrations** via `drizzle-kit`
- **Redis** for Bull queues and caching

## Testing
- **API unit/integration**: Jest + ts-jest + supertest
- **Property-based testing**: fast-check
- **Test structure**: Separate Jest projects for unit, integration, and contract tests

## Common Commands

```bash
# Development
pnpm dev:api          # Start API in watch mode
pnpm dev:admin        # Start admin panel dev server

# Build
pnpm build:api        # Build API
pnpm build:admin      # Build admin panel (vue-tsc + vite build)

# Database
pnpm --filter @edu/api db:generate   # Generate Drizzle migrations
pnpm --filter @edu/api db:migrate    # Run migrations
pnpm --filter @edu/api db:seed       # Seed database
pnpm --filter @edu/api db:studio     # Open Drizzle Studio

# Testing (API)
pnpm --filter @edu/api test           # Run all test projects
pnpm --filter @edu/api test:unit      # Unit tests only
pnpm --filter @edu/api test:integration  # Integration tests only
pnpm --filter @edu/api test:contract  # Contract tests (mocked DB)
pnpm --filter @edu/api test:contract:real  # Contract tests (real DB)

# Lint & Format
pnpm lint             # Lint all packages
pnpm format           # Format all files with Prettier
pnpm format:check     # Check formatting

# Mobile (run from apps/mobile/)
flutter run           # Run mobile app
flutter build apk     # Build Android APK
dart run build_runner build  # Generate Riverpod/Drift code
```

## CI/CD
- GitHub Actions workflows in `.github/workflows/`
- `ci.yml` — lint + test on PRs
- `deploy.yml` — production deployment
- `build-apk.yml` — Android APK build
