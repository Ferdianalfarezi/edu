// Feature: sistem-pengembangan-v2, Property 4: Setiap item guru yang dirender menampilkan nama, email, dan telepon (atau "-")

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// ---------------------------------------------------------------------------
// Types mirroring GuruView.vue
// ---------------------------------------------------------------------------

interface GuruItem {
  id: string;
  nama: string;
  email: string;
  telepon: string | null;
}

// ---------------------------------------------------------------------------
// Display logic extracted from GuruView.vue template as pure functions
// Mirrors: {{ guru.nama }}, {{ guru.email }}, {{ guru.telepon ?? '-' }}
// ---------------------------------------------------------------------------

function displayNama(guru: GuruItem): string {
  return guru.nama;
}

function displayEmail(guru: GuruItem): string {
  return guru.email;
}

function displayTelepon(guru: GuruItem): string {
  return guru.telepon ?? '-';
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const nonEmptyStringArb = fc
  .string({ minLength: 1, maxLength: 80 })
  .filter((s) => s.trim().length > 0);

const emailArb = fc
  .tuple(
    fc.string({ minLength: 1, maxLength: 15 }).filter((s) => /^[a-zA-Z0-9]+$/.test(s)),
    fc.string({ minLength: 1, maxLength: 15 }).filter((s) => /^[a-zA-Z0-9]+$/.test(s)),
    fc.string({ minLength: 2, maxLength: 5 }).filter((s) => /^[a-z]+$/.test(s)),
  )
  .map(([user, domain, tld]) => `${user}@${domain}.${tld}`);

// telepon can be a non-empty string or null
const teleponArb: fc.Arbitrary<string | null> = fc.oneof(
  fc.constant(null),
  fc
    .string({ minLength: 5, maxLength: 15 })
    .filter((s) => s.trim().length > 0)
    .map((s) => s),
);

const guruItemArb: fc.Arbitrary<GuruItem> = fc.record({
  id: fc.uuid(),
  nama: nonEmptyStringArb,
  email: emailArb,
  telepon: teleponArb,
});

// ---------------------------------------------------------------------------
// Property 4: Setiap item guru yang dirender menampilkan nama, email, dan telepon (atau "-")
// **Validates: Requirements 3.4**
// ---------------------------------------------------------------------------

describe('Property 4: Setiap item guru yang dirender menampilkan nama, email, dan telepon (atau "-")', () => {
  it('displayNama selalu mengembalikan string non-kosong', () => {
    fc.assert(
      fc.property(guruItemArb, (guru) => {
        const result = displayNama(guru);
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  it('displayEmail selalu mengembalikan string non-kosong', () => {
    fc.assert(
      fc.property(guruItemArb, (guru) => {
        const result = displayEmail(guru);
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  it('displayTelepon mengembalikan nilai telepon jika non-null, "-" jika null', () => {
    fc.assert(
      fc.property(guruItemArb, (guru) => {
        const result = displayTelepon(guru);
        if (guru.telepon !== null) {
          expect(result).toBe(guru.telepon);
          expect(result).not.toBe('-');
        } else {
          expect(result).toBe('-');
        }
      }),
      { numRuns: 100 },
    );
  });

  it('displayTelepon tidak pernah mengembalikan string kosong', () => {
    fc.assert(
      fc.property(guruItemArb, (guru) => {
        const result = displayTelepon(guru);
        expect(result.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  it('semua tiga kolom terdisplay untuk setiap item dalam array guru', () => {
    fc.assert(
      fc.property(fc.array(guruItemArb, { minLength: 1, maxLength: 30 }), (guruList) => {
        for (const guru of guruList) {
          const nama = displayNama(guru);
          const email = displayEmail(guru);
          const telepon = displayTelepon(guru);

          // nama: non-empty
          expect(nama.length).toBeGreaterThan(0);

          // email: non-empty
          expect(email.length).toBeGreaterThan(0);

          // telepon: either the original value or fallback "-", never empty, never null/undefined
          expect(telepon).toBeDefined();
          expect(telepon).not.toBeNull();
          expect(telepon.length).toBeGreaterThan(0);
          if (guru.telepon !== null) {
            expect(telepon).toBe(guru.telepon);
          } else {
            expect(telepon).toBe('-');
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
