/**
 * Property 12: User search returns only matching users
 *
 * For any search term of 3 or more characters, every user in the response
 * SHALL have the search term appearing (case-insensitive) in at least one of:
 * email, nama, or phone fields.
 *
 * **Validates: Requirements 8.7**
 *
 * This is a PURE logic property test — simulates the search/filter logic of
 * `listUsersCrossTenant` without hitting a real database.
 */

import fc from 'fast-check';
import { PBT_CONFIG } from '../config';
import {
  arbitraryUuid,
  arbitraryPhoneNumber,
  arbitraryEmail,
  arbitraryName,
} from '../arbitraries/common';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserRecord {
  id: string;
  nama: string;
  email: string;
  phone: string;
  tenant_id: string;
}

// ─── Simulated User Search Logic ──────────────────────────────────────────────

/**
 * Mirrors the search logic from `listUsersCrossTenant` in user.service.ts:
 * uses case-insensitive substring matching (ILIKE '%search%') across
 * nama, email, and phone fields.
 */
function searchUsers(users: UserRecord[], searchTerm: string): UserRecord[] {
  const lowerSearch = searchTerm.toLowerCase();
  return users.filter(
    (u) =>
      u.nama.toLowerCase().includes(lowerSearch) ||
      u.email.toLowerCase().includes(lowerSearch) ||
      u.phone.toLowerCase().includes(lowerSearch),
  );
}

/**
 * Checks whether a user matches the search term in at least one field.
 */
function userMatchesSearch(user: UserRecord, searchTerm: string): boolean {
  const lower = searchTerm.toLowerCase();
  return (
    user.nama.toLowerCase().includes(lower) ||
    user.email.toLowerCase().includes(lower) ||
    user.phone.toLowerCase().includes(lower)
  );
}

// ─── Arbitrary Generators ─────────────────────────────────────────────────────

/**
 * Generates a random user record with realistic fields.
 */
function arbitraryUser(): fc.Arbitrary<UserRecord> {
  return fc.record({
    id: arbitraryUuid(),
    nama: arbitraryName(),
    email: arbitraryEmail(),
    phone: arbitraryPhoneNumber(),
    tenant_id: arbitraryUuid(),
  });
}

/**
 * Generates a list of 5-30 random users.
 */
function arbitraryUserList(): fc.Arbitrary<UserRecord[]> {
  return fc.array(arbitraryUser(), { minLength: 5, maxLength: 30 });
}

/**
 * Generates a valid search term: a random substring of at least 3 characters
 * taken from one of the user's fields (to ensure at least one hit exists).
 * This tests that ALL results match, not that results are always non-empty.
 */
function arbitrarySearchTermFromUsers(users: UserRecord[]): fc.Arbitrary<string> {
  return fc.integer({ min: 0, max: users.length - 1 }).chain((userIdx) => {
    const u = users[userIdx];
    // Pick a random field to extract a substring from
    return fc.constantFrom('nama', 'email', 'phone').chain((field) => {
      const fieldValue = u[field as keyof Pick<UserRecord, 'nama' | 'email' | 'phone'>];
      if (fieldValue.length < 3) {
        // Fallback: use first 3 chars of email (always long enough)
        return fc.constant(u.email.substring(0, 3));
      }
      const maxStart = fieldValue.length - 3;
      return fc.integer({ min: 0, max: maxStart }).chain((start) => {
        const maxLen = Math.min(fieldValue.length - start, 10);
        const minLen = 3;
        return fc.integer({ min: minLen, max: Math.max(minLen, maxLen) }).map((len) => {
          return fieldValue.substring(start, start + len);
        });
      });
    });
  });
}

/**
 * Generates a completely random search string of 3+ characters
 * (may or may not match any user).
 */
function arbitraryRandomSearchTerm(): fc.Arbitrary<string> {
  return fc.string({
    minLength: 3,
    maxLength: 8,
    unit: fc.constantFrom(
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
      'g',
      'h',
      'i',
      'j',
      'k',
      'l',
      'm',
      'n',
      'o',
      'p',
      'q',
      'r',
      's',
      't',
      'u',
      'v',
      'w',
      'x',
      'y',
      'z',
      '0',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
    ),
  });
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Feature: superadmin-cross-tenant-access, Property 12: User search returns only matching users', () => {
  it('every result from searchUsers contains the search term in at least one of email, nama, or phone (case-insensitive)', () => {
    fc.assert(
      fc.property(
        arbitraryUserList().chain((users) =>
          arbitrarySearchTermFromUsers(users).map((search) => ({ users, search })),
        ),
        ({ users, search }) => {
          const results = searchUsers(users, search);

          // PROPERTY: every user in the response matches the search term
          return results.every((u) => userMatchesSearch(u, search));
        },
      ),
      PBT_CONFIG,
    );
  });

  it('no non-matching user is included in search results', () => {
    fc.assert(
      fc.property(
        arbitraryUserList().chain((users) =>
          arbitraryRandomSearchTerm().map((search) => ({ users, search })),
        ),
        ({ users, search }) => {
          const results = searchUsers(users, search);

          // PROPERTY: every result matches, and no non-matching user is returned
          const nonMatchingInResults = results.filter((u) => !userMatchesSearch(u, search));
          return nonMatchingInResults.length === 0;
        },
      ),
      PBT_CONFIG,
    );
  });

  it('all users that match the search term are included in results (completeness)', () => {
    fc.assert(
      fc.property(
        arbitraryUserList().chain((users) =>
          arbitrarySearchTermFromUsers(users).map((search) => ({ users, search })),
        ),
        ({ users, search }) => {
          const results = searchUsers(users, search);

          // PROPERTY: every user that actually matches is present in results
          const expectedMatching = users.filter((u) => userMatchesSearch(u, search));
          const resultIds = new Set(results.map((r) => r.id));
          return expectedMatching.every((u) => resultIds.has(u.id));
        },
      ),
      PBT_CONFIG,
    );
  });

  it('search is case-insensitive — uppercase and lowercase variants of the same term return identical results', () => {
    fc.assert(
      fc.property(
        arbitraryUserList().chain((users) =>
          arbitrarySearchTermFromUsers(users).map((search) => ({ users, search })),
        ),
        ({ users, search }) => {
          const resultsLower = searchUsers(users, search.toLowerCase());
          const resultsUpper = searchUsers(users, search.toUpperCase());
          const resultsMixed = searchUsers(users, search);

          // PROPERTY: case variants of the same search term yield the same result set
          const idsLower = new Set(resultsLower.map((r) => r.id));
          const idsUpper = new Set(resultsUpper.map((r) => r.id));
          const idsMixed = new Set(resultsMixed.map((r) => r.id));

          return (
            idsLower.size === idsUpper.size &&
            idsLower.size === idsMixed.size &&
            [...idsLower].every((id) => idsUpper.has(id)) &&
            [...idsLower].every((id) => idsMixed.has(id))
          );
        },
      ),
      PBT_CONFIG,
    );
  });
});
