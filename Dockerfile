# API Service Dockerfile
# Target: Railway deployment — 1GB RAM, 1 vCPU (ADR-006)

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

# ---- Dependencies ----
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile --prod=false

# ---- Build ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/ ./apps/api/
COPY packages/shared/ ./packages/shared/
RUN pnpm --filter @edu/api build

# ---- Production ----
FROM base AS production
ENV NODE_ENV=production
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/packages/shared/dist ./packages/shared/dist

# Railway injects PORT env var
EXPOSE 3000

# Run database migrations then start
CMD ["sh", "-c", "node apps/api/dist/main.js"]
