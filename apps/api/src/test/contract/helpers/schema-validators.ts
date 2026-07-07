/**
 * Shared contract validators that check response shapes match
 * what the Vue admin frontend expects.
 *
 * These don't validate data correctness — just structure, types, field presence.
 */

export function expectPaginatedResponse(body: any, itemValidator?: (item: any) => void) {
  expect(body).toHaveProperty('data');
  expect(body).toHaveProperty('meta');
  expect(Array.isArray(body.data)).toBe(true);
  expect(body.meta).toHaveProperty('has_next');
  expect(typeof body.meta.has_next).toBe('boolean');
  expect(body.meta).toHaveProperty('cursor');
  if (body.meta.cursor !== null) {
    expect(typeof body.meta.cursor).toBe('string');
  }
  if (body.meta.total !== undefined) {
    expect(typeof body.meta.total).toBe('number');
  }
  if (itemValidator && body.data.length > 0) {
    body.data.forEach(itemValidator);
  }
}

export function expectDataArray(body: any, itemValidator?: (item: any) => void) {
  expect(body).toHaveProperty('data');
  expect(Array.isArray(body.data)).toBe(true);
  if (itemValidator && body.data.length > 0) {
    body.data.forEach(itemValidator);
  }
}

export function expectApiError(body: any, expectedStatus: number) {
  expect(body).toHaveProperty('statusCode', expectedStatus);
  expect(body).toHaveProperty('message');
  expect(typeof body.message).toBe('string');
  if (body.error !== undefined) {
    expect(typeof body.error).toBe('string');
  }
}

export function expectLoginResponse(body: any) {
  expect(body).toHaveProperty('access_token');
  expect(typeof body.access_token).toBe('string');
  expect(body).toHaveProperty('refresh_token');
  expect(typeof body.refresh_token).toBe('string');
  expect(body).toHaveProperty('must_change_password');
  expect(typeof body.must_change_password).toBe('boolean');
  expect(body).toHaveProperty('user');
  expectAuthUser(body.user);
}

export function expectAuthUser(user: any) {
  expect(user).toHaveProperty('id');
  expect(typeof user.id).toBe('string');
  expect(user).toHaveProperty('name');
  expect(typeof user.name).toBe('string');
  expect(user).toHaveProperty('role');
  expect(typeof user.role).toBe('string');
  expect(user).toHaveProperty('tenant_id');
}

export function expectMessageResponse(body: any) {
  expect(body).toHaveProperty('message');
  expect(typeof body.message).toBe('string');
}

export function expectObjectWithFields(body: any, requiredFields: string[]) {
  for (const field of requiredFields) {
    expect(body).toHaveProperty(field);
  }
}

export function expectUUID(value: any) {
  expect(typeof value).toBe('string');
  expect(value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
}
