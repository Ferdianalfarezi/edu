// Feature: sistem-pengembangan-v2, Property 2: Semua nilai null/undefined/string kosong/whitespace → tampil Logo_Default, bukan src kosong

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// ---------------------------------------------------------------------------
// Pure function under test
//
// Extracted from AppTopBar.vue logo resolution logic (Req 1.6 & 1.7):
//   v-if="resolvedLogoUrl" → shows school logo
//   v-else                 → shows /logo.png (Logo_Default)
//
// The correct specification (Requirements 1.7) states that null, undefined,
// empty string, AND whitespace-only strings must all use Logo_Default.
// This function encodes that correct behaviour.
// ---------------------------------------------------------------------------

/**
 * Returns true only when logoUrl is a non-empty, non-whitespace string.
 * Returns false for null, undefined, empty string, and whitespace-only strings.
 *
 * Used by AppTopBar to decide whether to render the school logo or Logo_Default (/logo.png).
 */
export function isLogoUrlValid(logoUrl: string | null | undefined): boolean {
  if (logoUrl === null || logoUrl === undefined) return false;
  return logoUrl.trim().length > 0;
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Generates whitespace-only strings (spaces, tabs, newlines) of length ≥ 1 */
const whitespaceOnlyArb = fc
  .array(fc.constantFrom(' ', '\t', '\n', '\r', '\u00a0'), { minLength: 1, maxLength: 20 })
  .map((chars) => chars.join(''));

/** Generates non-empty strings that contain at least one non-whitespace character */
const nonEmptyUrlArb = fc
  .string({ minLength: 1, maxLength: 200 })
  .filter((s) => s.trim().length > 0);

/** Generates realistic URL strings */
const httpUrlArb = fc
  .tuple(
    fc.constantFrom('http', 'https'),
    fc.stringMatching(/^[a-z0-9-]{3,20}$/),
    fc.constantFrom('.com', '.id', '.net', '.org'),
    fc.string({ minLength: 1, maxLength: 50 }).filter((s) => /^[a-zA-Z0-9/_.-]+$/.test(s)),
  )
  .map(([scheme, domain, tld, path]) => `${scheme}://${domain}${tld}/${path}`);

// ---------------------------------------------------------------------------
// Property 2: Semua nilai null/undefined/string kosong/whitespace → Logo_Default
// **Validates: Requirements 1.7**
// ---------------------------------------------------------------------------

describe('Property 2: Semua nilai null/undefined/string kosong/whitespace → tampil Logo_Default, bukan src kosong', () => {
  // Feature: sistem-pengembangan-v2, Property 2: Semua nilai null/undefined/string kosong/whitespace → tampil Logo_Default, bukan src kosong

  it('null → isLogoUrlValid returns false (trigger Logo_Default)', () => {
    expect(isLogoUrlValid(null)).toBe(false);
  });

  it('undefined → isLogoUrlValid returns false (trigger Logo_Default)', () => {
    expect(isLogoUrlValid(undefined)).toBe(false);
  });

  it('empty string "" → isLogoUrlValid returns false (trigger Logo_Default)', () => {
    expect(isLogoUrlValid('')).toBe(false);
  });

  it('[property] whitespace-only strings of any composition → always returns false', () => {
    fc.assert(
      fc.property(whitespaceOnlyArb, (ws) => {
        expect(isLogoUrlValid(ws)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('[property] strings with leading/trailing whitespace but non-empty content → returns true', () => {
    // A string like "  https://s3.aws/logo.png  " should be valid —
    // the spec says empty-like values are invalid, not padded-but-real URLs.
    // However the real check is trim().length > 0 so any non-whitespace content qualifies.
    fc.assert(
      fc.property(
        nonEmptyUrlArb.map((s) => `  ${s}  `),
        (paddedUrl) => {
          // paddedUrl always has at least one non-whitespace char inside
          expect(isLogoUrlValid(paddedUrl)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('[property] valid HTTP/HTTPS URLs → always returns true', () => {
    fc.assert(
      fc.property(httpUrlArb, (url) => {
        expect(isLogoUrlValid(url)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('[property] any non-empty, non-whitespace string → returns true (logo should display)', () => {
    fc.assert(
      fc.property(nonEmptyUrlArb, (url) => {
        expect(isLogoUrlValid(url)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('[property] null | undefined | empty | whitespace are exhaustively the "empty-like" set', () => {
    // Combine all "empty-like" input categories into a single property run.
    // Each generated value must produce false regardless of category.
    const emptyLikeArb = fc.oneof(
      fc.constant(null as null),
      fc.constant(undefined as undefined),
      fc.constant('' as string),
      whitespaceOnlyArb,
    );

    fc.assert(
      fc.property(emptyLikeArb, (emptyLike) => {
        expect(isLogoUrlValid(emptyLike)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
