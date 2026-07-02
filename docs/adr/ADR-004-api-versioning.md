# ADR-004: API Versioning via URL Prefix

## Status

Proposed

## Context

The system serves two client platforms:
- **Admin Panel (Vue.js SPA)**: deployed as a static site, updates immediately on deploy
- **Flutter Mobile App**: distributed via app stores, cannot be force-updated

Breaking API changes (removing fields, changing response shapes, altering validation rules, modifying auth flows) will strand mobile users on older app versions. Unlike the web panel, the mobile app has:
- App store review delays (1-7 days)
- Users who don't update (some never do)
- No way to force an immediate update without blocking access entirely

Without versioning, any breaking change requires either:
1. Supporting the old behavior forever (technical debt accumulates)
2. Force-killing old app versions (bad UX, angry parents)

## Decision

Use **URL path prefix versioning** (`/api/v1/`, `/api/v2/`) for all API endpoints.

### Convention

```
https://api.example.com/api/v1/absensi/kelas-hari-ini
https://api.example.com/api/v1/tagihan/generate
```

### Rules

1. **Current version**: `v1` at launch
2. **Backwards-compatible changes** (adding fields, new endpoints, new optional params): NO version bump needed
3. **Breaking changes** (removing fields, changing types, altering required params, changing response structure): requires new version (`v2`)
4. **Deprecation policy**: old version supported for minimum 6 months after new version launches
5. **Minimum app version**: server returns `X-Minimum-App-Version` header; app shows "update required" screen when below minimum

### NestJS Implementation

```typescript
// app.module.ts - route prefix
app.setGlobalPrefix('api/v1');

// When v2 is needed:
// Create v2 module with new controllers
// Keep v1 controllers active for deprecation period
@Module({
  imports: [V1Module, V2Module],
})
export class AppModule {}
```

### Mobile App Handling

```dart
// On every API response, check minimum version header
final minVersion = response.headers['X-Minimum-App-Version'];
if (currentAppVersion < minVersion) {
  showForceUpdateScreen();
}
```

### Version Lifecycle

```
v1 launched → breaking change needed → 
v2 created (v1 still active) → 
deprecation notice sent to users → 
6 months pass → v1 sunset (returns 410 Gone)
```

## Alternatives Considered

- **Header-based versioning** (`Accept: application/vnd.edu.v1+json`) — more RESTful in theory, but harder to debug, test in browser, and share URLs. Client implementation is more error-prone.
- **Query parameter versioning** (`?version=1`) — easy to forget, pollutes URLs, caching issues.
- **No versioning (additive only)** — works until you need to fix a design mistake in a response shape. Then you're stuck with the wrong format forever or you break clients.
- **GraphQL** — solves versioning natively but adds complexity inappropriate for this project's team size and timeline.

## Consequences

### Positive
- Mobile users never experience broken functionality due to API changes
- Clear deprecation path gives time for app store updates to propagate
- Server can maintain old behavior without polluting new code
- Force-update mechanism as escape hatch for critical security fixes

### Negative
- Maintaining two versions simultaneously doubles some controller/service code during transition
- Must discipline the team to only bump versions for actual breaking changes (not cosmetic)
- Testing matrix grows (must test both v1 and v2 during overlap period)
- Slightly longer URLs

## Trade-offs

User experience stability and gradual migration are prioritized over API simplicity. The operational cost is low (version bumps should be rare for an MVP) and the protection against bricking deployed mobile apps is essential.
