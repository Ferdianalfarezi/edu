# API Contract Tests

Validates that API response shapes match what the Vue admin frontend expects.

## Philosophy

These tests don't verify business logic — that's what unit and integration tests do.
Contract tests answer one question: **"Will the frontend break if I deploy this?"**

## Two Modes

### Mocked (fast, local)
```bash
pnpm test:contract
```
- Uses mocked services (no DB, no Redis needed)
- Runs in ~15 seconds
- Triggered automatically by Kiro Hook on controller/service changes
- Validates: response structure, field names, types, pagination shape, error format

### Real DB (thorough, CI)
```bash
pnpm test:contract:real
```
- Uses real PostgreSQL + Redis (requires running services)
- Validates the same shapes but with real data flow
- Catches: service-level response shape changes that mocks miss

## Running

```bash
# Run all contract tests (fast, mocked)
pnpm test:contract

# Run with watch mode
pnpm test:contract:watch

# Run specific module
npx jest --config jest.contract-mock.config.ts --testPathPattern auth.contract

# Run full suite including contract in CI
pnpm test
```

## Adding New Contract Tests

1. Create `apps/api/src/test/contract/<module>.contract.spec.ts`
2. Read the corresponding controller to understand endpoints
3. Read the Vue frontend views to understand what shapes they expect
4. Mock the service layer with the expected return values
5. Use shared validators from `helpers/schema-validators.ts`
6. Run: `npx jest --config jest.contract-mock.config.ts --testPathPattern <module>`

## Template

```typescript
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { MyController } from '@/modules/my/my.controller';
import { MyService } from '@/modules/my/my.service';
import { createMockTestApp, MockProviders } from './helpers/test-app.factory';
import { adminToken } from './helpers/auth.helper';
import { expectObjectWithFields, expectApiError } from './helpers/schema-validators';

describe('My Module Contract Tests', () => {
  let app: INestApplication;
  let mockService: Record<string, jest.Mock>;

  const mockDb = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue([]),
  };
  const mockRedis = {
    exists: jest.fn().mockResolvedValue(0),
    get: jest.fn().mockResolvedValue(null),
  };

  beforeAll(async () => {
    mockService = { myMethod: jest.fn() };
    const mocks: MockProviders = {
      db: mockDb,
      redis: mockRedis,
      serviceOverrides: [{ provide: MyService, useValue: mockService }],
    };
    app = await createMockTestApp([MyController], [MyService], mocks);
  });

  afterAll(async () => { await app.close(); });

  it('should return expected shape', async () => {
    mockService.myMethod.mockResolvedValue({ id: '...', name: '...' });
    const res = await request(app.getHttpServer())
      .get('/api/v1/my-endpoint')
      .set('Authorization', `Bearer ${adminToken()}`)
      .expect(200);
    expectObjectWithFields(res.body, ['id', 'name']);
  });
});
```

## What to Validate

Per endpoint, validate:
- ✅ HTTP status code for success
- ✅ Response body structure (`{ data, meta }` vs `{ data }` vs direct object)
- ✅ Field presence and types
- ✅ Pagination meta shape (`has_next`, `cursor`, `total?`)
- ✅ Error response shape (401, 400, 403, 404)
- ✅ Role-based access (403 for wrong role)
- ❌ Data correctness (that's integration test territory)
- ❌ Business logic (that's unit test territory)

## Frontend Expectations Reference

| Pattern | Frontend Code | Expected Shape |
|---------|--------------|----------------|
| Paginated list | `api.get<PaginatedResponse<T>>` | `{ data: T[], meta: { has_next, cursor, total? } }` |
| Non-paginated list | `api.get<{ data: T[] }>` | `{ data: T[] }` |
| Direct array | `api.get<T[]>` (konfigurasi) | `T[]` |
| Mutation success | `api.post<T>` | Direct object or `{ message, data }` |
| Delete | `api.delete` | `{ message }` |
| Error | `error.response.data.message` | `{ statusCode, message, error?, details? }` |

## Kiro Hooks

Two hooks auto-trigger contract tests:
1. **contract-test-controller** — on `*.controller.ts` file changes
2. **contract-test-service** — on `*.service.ts` file changes
