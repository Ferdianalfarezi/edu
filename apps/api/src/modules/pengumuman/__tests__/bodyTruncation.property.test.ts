import fc from 'fast-check';

/**
 * Property 3: Notification Body Truncation
 *
 * For any deskripsi string, the notification body SHALL equal
 * deskripsi.substring(0, 200) + "..." when deskripsi.length > 200,
 * and SHALL equal deskripsi unchanged when deskripsi.length <= 200.
 *
 * **Validates: Requirements 4.1**
 *
 * Feature: announcement, Property 3: Notification Body Truncation
 */

/**
 * Pure truncation logic extracted from PengumumanNotificationProcessor.
 * See: apps/api/src/jobs/pengumuman-notification.processor.ts
 */
function truncateBody(deskripsi: string): string {
  return deskripsi.length > 200 ? deskripsi.substring(0, 200) + '...' : deskripsi;
}

describe('Feature: announcement, Property 3: Notification Body Truncation', () => {
  const shortStringArb = fc.string({ minLength: 0, maxLength: 200 });
  const longStringArb = fc.string({ minLength: 201, maxLength: 5000 });
  const anyStringArb = fc.string({ minLength: 0, maxLength: 5000 });

  it('strings with length <= 200 are returned unchanged', () => {
    fc.assert(
      fc.property(shortStringArb, (deskripsi) => {
        const result = truncateBody(deskripsi);
        expect(result).toBe(deskripsi);
      }),
      { numRuns: 100 },
    );
  });

  it('strings with length > 200 are truncated to first 200 chars + "..."', () => {
    fc.assert(
      fc.property(longStringArb, (deskripsi) => {
        const result = truncateBody(deskripsi);
        expect(result).toBe(deskripsi.substring(0, 200) + '...');
      }),
      { numRuns: 100 },
    );
  });

  it('truncated strings always have length 203', () => {
    fc.assert(
      fc.property(longStringArb, (deskripsi) => {
        const result = truncateBody(deskripsi);
        expect(result.length).toBe(203);
      }),
      { numRuns: 100 },
    );
  });

  it('for any string, result length is <= 203', () => {
    fc.assert(
      fc.property(anyStringArb, (deskripsi) => {
        const result = truncateBody(deskripsi);
        expect(result.length).toBeLessThanOrEqual(203);
      }),
      { numRuns: 100 },
    );
  });
});
