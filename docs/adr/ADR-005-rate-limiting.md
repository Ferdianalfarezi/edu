# ADR-005: Rate Limiting Strategy

## Status

Proposed

## Context

The system has several endpoints vulnerable to abuse:
- **Parent login** (phone-only, no password): enumeration attacks can discover registered phone numbers and access accounts
- **Billing generation**: accidental double-clicks can trigger expensive batch operations
- **File uploads**: large files consume bandwidth and storage
- **Export endpoints**: heavy DB queries for report generation

Without rate limiting, the system is exposed to:
1. Brute-force phone number enumeration (try thousands of numbers, see which ones succeed)
2. Resource exhaustion via repeated heavy operations
3. Accidental duplicate requests from impatient users

## Decision

Implement tiered rate limiting using Redis-backed sliding window counters, with different limits per endpoint category.

### Rate Limit Tiers

| Endpoint Category | Limit | Window | Key | Response |
|---|---|---|---|---|
| Parent login (`POST /auth/login` phone-based) | 5 attempts | 1 hour | Phone number | 429 + lockout message |
| Staff login (`POST /auth/login` email-based) | Already handled: 5 failures = 15 min lock | Per account | DB field | 401 + lock message |
| File upload (`POST */upload*`) | 10 requests | 5 minutes | User ID | 429 |
| Billing generation (`POST /tagihan/generate`) | 2 requests | 1 minute | Tenant ID | 429 |
| Export endpoints (`GET */export*`) | 5 requests | 10 minutes | User ID | 429 |
| General API (all other endpoints) | 100 requests | 1 minute | User ID | 429 |
| Unauthenticated endpoints | 30 requests | 1 minute | IP address | 429 |

### Implementation

```typescript
// NestJS Guard using @nestjs/throttler with Redis store
@Injectable()
export class PhoneLoginThrottleGuard implements CanActivate {
  constructor(private readonly redis: Redis) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const phone = request.body.phone;
    if (!phone) return true; // Not a phone login

    const key = `rate:phone-login:${phone}`;
    const attempts = await this.redis.incr(key);
    if (attempts === 1) {
      await this.redis.expire(key, 3600); // 1 hour window
    }

    if (attempts > 5) {
      throw new HttpException(
        'Terlalu banyak percobaan login. Coba lagi dalam 1 jam.',
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
    return true;
  }
}
```

### Response Format

```json
{
  "statusCode": 429,
  "error": "Too Many Requests",
  "message": "Terlalu banyak percobaan. Coba lagi nanti.",
  "retryAfter": 3600
}
```

Include `Retry-After` header with seconds until the window resets.

### Anti-Enumeration for Phone Login

To prevent distinguishing "phone not registered" from "rate limited":
- After 5 failed attempts for a phone number, ALL subsequent attempts return the same generic 429 response — whether the phone exists or not
- Successful logins reset the counter
- Failed login response is always the same message regardless of whether phone exists: "Login gagal. Pastikan nomor telepon terdaftar."

## Alternatives Considered

- **No rate limiting (current state)** — leaves phone login open to enumeration and abuse
- **CAPTCHA on login** — works for web, but terrible UX on mobile for parents (the lowest-tech user group)
- **IP-based only** — insufficient because multiple users behind school WiFi share one IP; also easily bypassed with rotating IPs
- **WAF/Cloudflare rate limiting** — useful as an additional layer but can't implement per-phone or per-user logic; too coarse-grained

## Consequences

### Positive
- Phone enumeration attacks become impractical (5 attempts per hour per number)
- Resource-heavy endpoints protected from accidental/intentional overload
- Redis-backed = minimal latency overhead (sub-millisecond per check)
- Sliding window = fair to legitimate users (no cliff-edge at window boundary)

### Negative
- Legitimate parent who misremembers phone number gets locked out for 1 hour
- School WiFi scenario: IP-based limits on unauthenticated endpoints may affect multiple staff
- Additional Redis keys (memory usage: negligible, ~100 bytes per active key)
- Must handle Redis unavailability gracefully (fail-open or fail-closed decision needed)

### Redis Failure Strategy

Fail-open: if Redis is unreachable, skip rate limit check and allow the request. Rationale: rate limiting is a protective measure, not a correctness requirement. Blocking all logins because Redis is down is worse than temporarily allowing unthrottled access.

## Trade-offs

Security hardening against enumeration attacks is prioritized over unconditional access. The 5-attempts-per-hour limit is generous enough for legitimate users (parents typically try 1-2 times) while making automated enumeration impractical.
