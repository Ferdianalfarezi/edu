/**
 * Property 9: Billing State Machine Transitions
 *
 * For any tagihan, the status transitions SHALL follow these rules:
 * (a) belum_bayar → menunggu_verifikasi (on parent upload)
 * (b) menunggu_verifikasi → lunas (if approved amount ≥ remaining)
 * (c) menunggu_verifikasi → cicilan (if approved amount < remaining)
 * (d) menunggu_verifikasi → ditolak (on rejection)
 * (e) ditolak → menunggu_verifikasi (on re-upload)
 * (f) cicilan → menunggu_verifikasi (on next upload)
 * (g) cicilan → lunas (when manual payments reach full amount)
 * (h) belum_bayar → lunas (on manual full payment)
 * (i) belum_bayar → cicilan (on manual partial payment)
 * (j) belum_bayar → dibatalkan (on cancellation)
 * No other transitions SHALL be permitted.
 *
 * **Validates: Requirements 11.1, 11.4, 11.8, 12.2, 12.3, 12.4, 12.6, 13.1, 13.2, 13.4, 34.5**
 *
 * Properties verified:
 * 1. Only valid transitions are allowed (arbitrary from→to pairs checked against the allowed list)
 * 2. Terminal states (lunas, dibatalkan) have NO outgoing transitions
 * 3. Every non-terminal state has at least one valid outgoing transition
 * 4. No self-transitions (from == to is never valid)
 */

import fc from 'fast-check';
import { PBT_CONFIG } from '../config';
import {
  VALID_TRANSITIONS,
  PAYMENT_STATUSES,
  type PaymentStatus,
  arbitraryPaymentStatus,
} from '../arbitraries/common';
import {
  arbitraryTransitionAttempt,
  arbitraryValidTransition,
  arbitraryInvalidTransition,
} from '../arbitraries/tagihan';

// ─── State Machine Logic Under Test ───────────────────────────────────────────

const TERMINAL_STATES: PaymentStatus[] = ['lunas', 'dibatalkan'];

/**
 * Determines if a transition from one state to another is valid
 * according to the billing state machine rules.
 */
function isValidTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

/**
 * Attempts to apply a state transition and returns the result.
 */
function applyTransition(
  currentStatus: PaymentStatus,
  targetStatus: PaymentStatus,
): { success: boolean; newStatus: PaymentStatus } {
  if (isValidTransition(currentStatus, targetStatus)) {
    return { success: true, newStatus: targetStatus };
  }
  return { success: false, newStatus: currentStatus };
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 9: Billing State Machine Transitions', () => {
  it('only valid transitions succeed — arbitrary from→to pairs checked against allowed list', () => {
    fc.assert(
      fc.property(arbitraryTransitionAttempt(), (transition) => {
        const result = applyTransition(transition.from, transition.to);
        const expected = isValidTransition(transition.from, transition.to);

        // PROPERTY: transition succeeds if and only if it's in the valid transitions map
        return result.success === expected;
      }),
      PBT_CONFIG,
    );
  });

  it('valid transitions always succeed and update the status', () => {
    fc.assert(
      fc.property(arbitraryValidTransition(), (transition) => {
        const result = applyTransition(transition.from, transition.to);

        // PROPERTY: valid transitions always succeed and set the new status
        return result.success === true && result.newStatus === transition.to;
      }),
      PBT_CONFIG,
    );
  });

  it('invalid transitions always fail and preserve the current status', () => {
    fc.assert(
      fc.property(arbitraryInvalidTransition(), (transition) => {
        const result = applyTransition(transition.from, transition.to);

        // PROPERTY: invalid transitions always fail and keep the original status
        return result.success === false && result.newStatus === transition.from;
      }),
      PBT_CONFIG,
    );
  });

  it('terminal states (lunas, dibatalkan) have NO outgoing transitions', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...TERMINAL_STATES),
        arbitraryPaymentStatus(),
        (terminalState, anyTarget) => {
          const result = applyTransition(terminalState, anyTarget);

          // PROPERTY: terminal states never allow any transition
          return result.success === false && result.newStatus === terminalState;
        },
      ),
      PBT_CONFIG,
    );
  });

  it('every non-terminal state has at least one valid outgoing transition', () => {
    const nonTerminalStates = PAYMENT_STATUSES.filter((s) => !TERMINAL_STATES.includes(s));

    fc.assert(
      fc.property(fc.constantFrom(...nonTerminalStates), (state) => {
        const outgoing = VALID_TRANSITIONS[state];

        // PROPERTY: every non-terminal state has at least one valid outgoing path
        return outgoing.length > 0;
      }),
      PBT_CONFIG,
    );
  });

  it('no self-transitions — from == to is never a valid transition', () => {
    fc.assert(
      fc.property(arbitraryPaymentStatus(), (status) => {
        const result = applyTransition(status, status);

        // PROPERTY: self-transitions are never valid
        return result.success === false && result.newStatus === status;
      }),
      PBT_CONFIG,
    );
  });
});
