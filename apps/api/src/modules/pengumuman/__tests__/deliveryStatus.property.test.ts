import fc from 'fast-check';

/**
 * Property 4: Delivery Status Determination
 *
 * For any set of FCM send results for a single recipient (across all their
 * device tokens), the notification status SHALL be 'terkirim' if at least one
 * result is successful, and SHALL be 'gagal' only if all results have failed
 * after maximum retry attempts.
 *
 * **Validates: Requirements 4.3, 4.4**
 *
 * Feature: announcement, Property 4: Delivery Status Determination
 */

/**
 * Pure extraction of the per-recipient delivery status logic from
 * PengumumanNotificationProcessor.handleSendPengumumanNotification.
 *
 * A recipient has multiple device tokens. Each token produces a send result.
 * The recipient status is 'terkirim' if at least one token succeeded,
 * 'gagal' if all tokens failed (after retries exhausted).
 */
function determineRecipientStatus(results: { success: boolean }[]): 'terkirim' | 'gagal' {
  if (results.length === 0) {
    return 'gagal';
  }
  return results.some((r) => r.success) ? 'terkirim' : 'gagal';
}

/**
 * Pure extraction of the overall pengumuman status logic.
 * Given per-recipient statuses, the pengumuman is 'terkirim' if any recipient
 * was successfully delivered, 'gagal' if all recipients failed.
 */
function determinePengumumanStatus(
  recipientStatuses: Array<'terkirim' | 'gagal'>,
): 'terkirim' | 'gagal' {
  if (recipientStatuses.length === 0) {
    return 'gagal';
  }
  return recipientStatuses.some((s) => s === 'terkirim') ? 'terkirim' : 'gagal';
}

describe('Feature: announcement, Property 4: Delivery Status Determination', () => {
  // Arbitrary for a single FCM result per device token
  const fcmResultArb = fc.record({ success: fc.boolean() });

  // Arbitrary for arrays of FCM results (1–10 tokens per recipient)
  const fcmResultsArb = fc.array(fcmResultArb, { minLength: 1, maxLength: 10 });

  describe('Per-recipient status determination', () => {
    it('status is "terkirim" if at least one result has success=true', () => {
      fc.assert(
        fc.property(fcmResultsArb, (results) => {
          fc.pre(results.some((r) => r.success));
          const status = determineRecipientStatus(results);
          expect(status).toBe('terkirim');
        }),
        { numRuns: 100 },
      );
    });

    it('status is "gagal" if all results have success=false', () => {
      // Generate arrays where every result is a failure
      const allFailedArb = fc.array(fc.constant({ success: false }), {
        minLength: 1,
        maxLength: 10,
      });

      fc.assert(
        fc.property(allFailedArb, (results) => {
          const status = determineRecipientStatus(results);
          expect(status).toBe('gagal');
        }),
        { numRuns: 100 },
      );
    });

    it('empty results array yields "gagal" (no tokens = delivery failed)', () => {
      const status = determineRecipientStatus([]);
      expect(status).toBe('gagal');
    });
  });

  describe('Overall pengumuman status determination', () => {
    // Arbitrary for per-recipient statuses
    const recipientStatusArb = fc.constantFrom<'terkirim' | 'gagal'>('terkirim', 'gagal');
    const recipientStatusesArb = fc.array(recipientStatusArb, { minLength: 1, maxLength: 20 });

    it('pengumuman is "terkirim" if at least one recipient has status "terkirim"', () => {
      fc.assert(
        fc.property(recipientStatusesArb, (statuses) => {
          fc.pre(statuses.some((s) => s === 'terkirim'));
          const overall = determinePengumumanStatus(statuses);
          expect(overall).toBe('terkirim');
        }),
        { numRuns: 100 },
      );
    });

    it('pengumuman is "gagal" if all recipients have status "gagal"', () => {
      const allGagalArb = fc.array(fc.constant<'gagal'>('gagal'), {
        minLength: 1,
        maxLength: 20,
      });

      fc.assert(
        fc.property(allGagalArb, (statuses) => {
          const overall = determinePengumumanStatus(statuses);
          expect(overall).toBe('gagal');
        }),
        { numRuns: 100 },
      );
    });

    it('empty recipients array yields "gagal"', () => {
      const overall = determinePengumumanStatus([]);
      expect(overall).toBe('gagal');
    });
  });

  describe('End-to-end: FCM results → recipient status → pengumuman status', () => {
    // Arbitrary for multiple recipients, each with 1–10 device tokens
    const multiRecipientResultsArb = fc.array(
      fc.array(fcmResultArb, { minLength: 1, maxLength: 10 }),
      { minLength: 1, maxLength: 10 },
    );

    it('pengumuman is "terkirim" iff at least one token across all recipients succeeded', () => {
      fc.assert(
        fc.property(multiRecipientResultsArb, (allResults) => {
          // Compute per-recipient statuses
          const recipientStatuses = allResults.map((results) => determineRecipientStatus(results));
          // Compute overall pengumuman status
          const pengumumanStatus = determinePengumumanStatus(recipientStatuses);

          // Ground truth: any success anywhere?
          const anyTokenSucceeded = allResults.some((results) => results.some((r) => r.success));

          if (anyTokenSucceeded) {
            expect(pengumumanStatus).toBe('terkirim');
          } else {
            expect(pengumumanStatus).toBe('gagal');
          }
        }),
        { numRuns: 100 },
      );
    });
  });
});
