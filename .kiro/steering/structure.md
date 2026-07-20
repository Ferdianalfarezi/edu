# Project Structure

```
edu/
├── apps/
│   ├── api/                    # NestJS backend
│   │   └── src/
│   │       ├── common/         # Shared utilities across modules
│   │       │   ├── decorators/ # Custom decorators (@Roles, @CurrentUser, etc.)
│   │       │   ├── dto/        # Shared DTOs (pagination, etc.)
│   │       │   ├── guards/     # Auth & role guards
│   │       │   ├── helpers/    # Utility helpers
│   │       │   ├── interceptors/
│   │       │   ├── interfaces/ # Shared interfaces
│   │       │   ├── monitoring/ # Health/metrics
│   │       │   ├── pipes/      # Validation pipes
│   │       │   └── utils/      # Pure utility functions
│   │       ├── config/         # App configuration
│   │       ├── drizzle/        # Database layer
│   │       │   ├── schema/     # Table definitions (one file per domain)
│   │       │   ├── migrations/ # SQL migrations
│   │       │   └── seed.ts     # Seed data
│   │       ├── jobs/           # Bull queue job processors
│   │       ├── modules/        # Feature modules (NestJS convention)
│   │       │   ├── absensi/
│   │       │   ├── auth/
│   │       │   ├── dashboard/
│   │       │   ├── jadwal/
│   │       │   ├── kelas/
│   │       │   ├── kenaikan-kelas/
│   │       │   ├── konfigurasi/
│   │       │   ├── mata-pelajaran/
│   │       │   ├── notifikasi/
│   │       │   ├── queue/
│   │       │   ├── rapor/
│   │       │   ├── redis/
│   │       │   ├── rpp/
│   │       │   ├── siswa/
│   │       │   ├── storage/
│   │       │   ├── tagihan/
│   │       │   ├── tahun-ajaran/
│   │       │   ├── tenant/
│   │       │   └── user/
│   │       ├── test/           # Test helpers and fixtures
│   │       ├── app.module.ts   # Main app module
│   │       ├── main.ts         # API entry point
│   │       ├── worker.module.ts # Worker module (queue consumers)
│   │       └── worker.ts       # Worker entry point
│   │
│   ├── admin/                  # Vue 3 admin panel
│   │   └── src/
│   │       ├── api/            # Axios client and API helpers
│   │       ├── assets/         # CSS (Tailwind entry)
│   │       ├── components/
│   │       │   ├── dashboard/  # Role-specific dashboard components
│   │       │   ├── layout/     # AppLayout, TenantContextSwitcher
│   │       │   └── ui/         # Reusable UI components (modals, buttons, tables)
│   │       ├── composables/    # Vue composables (useToast, etc.)
│   │       ├── router/         # Vue Router config with role-based guards
│   │       ├── stores/         # Pinia stores (auth, tenant-context)
│   │       ├── views/          # Page-level components (one per route)
│   │       ├── App.vue
│   │       └── main.ts
│   │
│   └── mobile/                 # Flutter mobile app
│       └── lib/
│           ├── core/           # App-wide utilities (router, theme, DI)
│           ├── features/       # Feature-based modules
│           │   ├── auth/
│           │   ├── guru/       # Teacher-facing features
│           │   └── orang_tua/  # Parent-facing features
│           ├── shared/         # Shared widgets and utilities
│           └── main.dart
│
├── packages/
│   └── shared/                 # Shared TypeScript package (@edu/shared)
│       └── src/
│           ├── enums/          # Role, Platform, etc.
│           └── interfaces/     # Shared DTOs/interfaces
│
├── docs/                       # Project documentation
└── .kiro/
    ├── specs/                  # Feature/bugfix specs
    └── steering/               # AI assistant guidance (this folder)
```

## Conventions

### API Module Structure
Each NestJS module typically contains:
- `*.module.ts` — Module definition
- `*.controller.ts` — HTTP endpoints
- `*.service.ts` — Business logic
- `*.dto.ts` — Request/response DTOs
- `*.spec.ts` — Tests alongside source

### Admin View Naming
- Views are named `{Feature}View.vue` in PascalCase (e.g., `SiswaManagementView.vue`)
- One view per route, lazy-loaded in the router

### Database Schema
- One schema file per domain entity in `apps/api/src/drizzle/schema/`
- Column names use `snake_case` in the database
- TypeScript properties use `camelCase` mapped from snake_case via Drizzle

### Path Aliases
- API: `@/` maps to `apps/api/src/`
- Admin: `@/` maps to `apps/admin/src/`

### Multi-Tenancy Pattern
- Tenant ID derived from JWT token at API level
- RLS policies enforce data isolation at the database layer
- Super admin can operate across tenants via context switching
