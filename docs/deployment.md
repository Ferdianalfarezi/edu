# Deployment Guide

## Architecture Overview

Per [ADR-006](./adr/ADR-006-load-estimation-and-scaling.md), the system runs on Railway with the following services:

| Service | Resource | Dockerfile | Config |
|---------|----------|------------|--------|
| API | 1GB RAM, 1 vCPU | `Dockerfile` | `railway.toml` |
| Worker | 512MB RAM, 0.5 vCPU | `Dockerfile.worker` | `railway.worker.toml` |
| PostgreSQL | 1GB RAM, 10GB storage | Railway plugin | — |
| Redis | 256MB | Railway plugin | — |
| Admin SPA | — | — | Cloudflare Pages |

## Railway Setup

### 1. Create Railway Project

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and link project
railway login
railway init
```

### 2. Add Services

In the Railway dashboard, create the following services in the same project:

1. **api** — Primary web service
   - Source: GitHub repo
   - Config file: `railway.toml` (auto-detected at root)
   - Set "Start Command" if not picked up from toml: `node apps/api/dist/main.js`

2. **worker** — Background job processor
   - Source: GitHub repo (same repo)
   - Config file: `railway.worker.toml`
   - Set custom Dockerfile path: `Dockerfile.worker`

3. **PostgreSQL** — Add via Railway plugin (Postgres)
   - Provides `DATABASE_URL` automatically as shared variable

4. **Redis** — Add via Railway plugin (Redis)
   - Provides `REDIS_URL` automatically as shared variable

### 3. Configure Environment Variables

Set these in Railway dashboard → Service → Variables.
Shared variables (project-level) are inherited by all services.

See `apps/api/.env.example` for the full list. Critical production variables:

```
NODE_ENV=production
PORT=3000

# Database — auto-injected by Railway PostgreSQL plugin
DATABASE_URL=${{Postgres.DATABASE_URL}}

# Redis — auto-injected by Railway Redis plugin
REDIS_HOST=${{Redis.REDIS_HOST}}
REDIS_PORT=${{Redis.REDIS_PORT}}
REDIS_PASSWORD=${{Redis.REDIS_PASSWORD}}

# JWT secrets — generate strong random values
JWT_ACCESS_SECRET=<generate-with-openssl-rand-base64-48>
JWT_REFRESH_SECRET=<generate-with-openssl-rand-base64-48>

# Firebase Cloud Messaging
FIREBASE_PROJECT_ID=<from-firebase-console>
FIREBASE_PRIVATE_KEY=<from-firebase-service-account-json>
FIREBASE_CLIENT_EMAIL=<from-firebase-service-account-json>

# Cloudflare R2
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_BUCKET=edu-uploads
S3_ACCESS_KEY_ID=<r2-access-key>
S3_SECRET_ACCESS_KEY=<r2-secret-key>
S3_REGION=auto

# SMTP
SMTP_HOST=<your-smtp-host>
SMTP_PORT=587
SMTP_USER=<your-smtp-user>
SMTP_PASSWORD=<your-smtp-password>
SMTP_FROM=noreply@yourschool.com

# App version control (ADR-004)
MINIMUM_APP_VERSION=1.0.0
```

### 4. Database Migrations

Migrations run as part of CI/CD (see `.github/workflows/deploy.yml`).
For manual runs:

```bash
# Set DATABASE_URL to Railway's migration URL
railway run pnpm --filter @edu/api db:migrate
```

### 5. Health Checks

Railway uses the configured health check endpoint to determine service readiness:

- **Readiness**: `GET /health` — checks DB, Redis, and storage connectivity
- **Liveness**: `GET /health/live` — confirms process is alive

The API returns `200` for healthy/degraded states (partial failures don't restart the service).
Returns `503` only when fully unhealthy.

### 6. X-Minimum-App-Version Header

Per [ADR-004](./adr/ADR-004-api-versioning.md), every API response includes:

```
X-Minimum-App-Version: 1.0.0
```

Mobile clients compare their version against this header. If the client version is below the minimum, it prompts the user to update. Controlled via `MINIMUM_APP_VERSION` env var.

---

## Cloudflare Pages (Admin SPA)

The Vue.js admin panel is deployed separately on Cloudflare Pages for:
- Global CDN distribution
- Zero-cost static hosting
- Automatic HTTPS
- No server resource consumption

### Setup via Dashboard

1. Go to Cloudflare Pages → Create Project → Connect GitHub
2. Configure:
   - **Build command**: `pnpm --filter @edu/admin build`
   - **Build output directory**: `apps/admin/dist`
   - **Root directory**: `/` (monorepo root)
3. Set environment variables:
   - `VITE_API_URL`: Railway API service URL (e.g., `https://edu-api.up.railway.app`)
4. Deploy

### Setup via CLI

```bash
cd apps/admin
pnpm build
npx wrangler pages deploy dist --project-name=edu-admin
```

### SPA Routing

The `apps/admin/public/_redirects` file ensures Vue Router history mode works:
all non-file requests are served by `index.html`.

### Environment Variables (Build-time)

Create these in Cloudflare Pages → Settings → Environment Variables:

| Variable | Value | Notes |
|----------|-------|-------|
| `VITE_API_URL` | `https://edu-api.up.railway.app` | Railway API URL |
| `NODE_VERSION` | `20` | Cloudflare build environment |

---

## Deployment Flow

```
main branch push
    │
    ├─── GitHub Actions (.github/workflows/deploy.yml)
    │       ├── Run Drizzle migrations
    │       └── Deploy API + Worker to Railway
    │
    └─── Cloudflare Pages (auto-deploy on push)
            └── Build & deploy admin SPA
```

---

## Monitoring

- **Health**: `GET /health` returns component-level status (DB, Redis, Storage)
- **Logs**: Structured JSON (pino) — viewable in Railway dashboard
- **Queue depth**: Alerts when Bull queue depth exceeds 500 (see `monitoring.config.ts`)
- **Uptime**: Railway provides built-in uptime monitoring via health checks

---

## Scaling (Post-MVP)

Per ADR-006 scaling triggers:

| Trigger | Action |
|---------|--------|
| API p95 > 500ms for 5 min | Add API replica (`numReplicas = 2`) |
| Queue depth > 500 for 2 min | Add worker replica |
| PG connections > 80% | Increase pool or add read replica |
| Redis memory > 200MB | Upgrade Redis tier |
