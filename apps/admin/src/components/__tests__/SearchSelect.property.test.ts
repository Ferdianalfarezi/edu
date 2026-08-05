// Feature: sistem-pengembangan-v2, Property 5: Posisi dropdown SearchSelect konsisten dengan posisi trigger

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// ---------------------------------------------------------------------------
// Position calculation logic (mirrors SearchSelect.vue updateDropdownPosition)
// ---------------------------------------------------------------------------

/**
 * Pure function extracted from SearchSelect.vue `updateDropdownPosition()`.
 *
 *   top:   rect.bottom + scrollY
 *   left:  rect.left   + scrollX
 *   width: rect.width
 *
 * Tested as a standalone function so we can drive arbitrary rects and scroll
 * offsets without mounting the Vue component or touching the DOM.
 */
function computeDropdownPosition(
  rect: { top: number; left: number; bottom: number; right: number; width: number; height: number },
  scrollX: number,
  scrollY: number,
): { top: number; left: number; width: number } {
  return {
    top: rect.bottom + scrollY,
    left: rect.left + scrollX,
    width: rect.width,
  };
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Generates a realistic DOMRect-like object.
 *
 * Constraints:
 *   - All values ≥ 0  (coordinates and dimensions are non-negative)
 *   - bottom = top + height  (geometric consistency)
 *   - right  = left + width
 */
const rectArb = fc
  .record({
    top: fc.float({ min: 0, max: 5000, noNaN: true }),
    left: fc.float({ min: 0, max: 5000, noNaN: true }),
    width: fc.float({ min: 0, max: 2000, noNaN: true }),
    height: fc.float({ min: 0, max: 1000, noNaN: true }),
  })
  .map(({ top, left, width, height }) => ({
    top,
    left,
    width,
    height,
    bottom: top + height,
    right: left + width,
  }));

/** Non-negative scroll offsets */
const scrollArb = fc.record({
  scrollX: fc.float({ min: 0, max: 10000, noNaN: true }),
  scrollY: fc.float({ min: 0, max: 10000, noNaN: true }),
});

// ---------------------------------------------------------------------------
// Property 5: Posisi dropdown SearchSelect konsisten dengan posisi trigger
// **Validates: Requirements 4.4**
// ---------------------------------------------------------------------------

describe('Property 5: Posisi dropdown SearchSelect konsisten dengan posisi trigger', () => {
  // ── 5a: top === rect.bottom + scrollY ─────────────────────────────────────

  it('top harus sama dengan rect.bottom + scrollY untuk semua rect dan scroll offset', () => {
    fc.assert(
      fc.property(rectArb, scrollArb, (rect, { scrollX, scrollY }) => {
        const pos = computeDropdownPosition(rect, scrollX, scrollY);
        expect(pos.top).toBe(rect.bottom + scrollY);
      }),
      { numRuns: 100 },
    );
  });

  // ── 5b: left === rect.left + scrollX ──────────────────────────────────────

  it('left harus sama dengan rect.left + scrollX untuk semua rect dan scroll offset', () => {
    fc.assert(
      fc.property(rectArb, scrollArb, (rect, { scrollX, scrollY }) => {
        const pos = computeDropdownPosition(rect, scrollX, scrollY);
        expect(pos.left).toBe(rect.left + scrollX);
      }),
      { numRuns: 100 },
    );
  });

  // ── 5c: width === rect.width ───────────────────────────────────────────────

  it('width harus sama persis dengan rect.width untuk semua rect', () => {
    fc.assert(
      fc.property(rectArb, scrollArb, (rect, { scrollX, scrollY }) => {
        const pos = computeDropdownPosition(rect, scrollX, scrollY);
        expect(pos.width).toBe(rect.width);
      }),
      { numRuns: 100 },
    );
  });

  // ── 5d: dropdown tidak pernah muncul di atas trigger ──────────────────────
  //
  // "Di atas trigger" = top < rect.top + scrollY
  // Karena top = rect.bottom + scrollY, dan rect.bottom >= rect.top (height ≥ 0),
  // maka top >= rect.top + scrollY selalu terpenuhi.

  it('dropdown tidak pernah muncul di atas trigger (top >= rect.top + scrollY)', () => {
    fc.assert(
      fc.property(rectArb, scrollArb, (rect, { scrollX, scrollY }) => {
        const pos = computeDropdownPosition(rect, scrollX, scrollY);
        // top ≥ rect.top + scrollY  →  dropdown appears at or below trigger top edge
        expect(pos.top).toBeGreaterThanOrEqual(rect.top + scrollY);
      }),
      { numRuns: 100 },
    );
  });

  // ── 5e: scroll offset tidak mempengaruhi width ────────────────────────────
  //
  // Width should be independent of scrollX / scrollY.

  it('width tidak dipengaruhi oleh perubahan scroll offset', () => {
    fc.assert(
      fc.property(rectArb, scrollArb, scrollArb, (rect, scroll1, scroll2) => {
        const pos1 = computeDropdownPosition(rect, scroll1.scrollX, scroll1.scrollY);
        const pos2 = computeDropdownPosition(rect, scroll2.scrollX, scroll2.scrollY);
        expect(pos1.width).toBe(pos2.width);
      }),
      { numRuns: 100 },
    );
  });

  // ── 5f: posisi bergeser linear dengan scroll ──────────────────────────────
  //
  // For the same rect, increasing scrollY by delta increases top by delta,
  // and increasing scrollX by delta increases left by delta.

  it('top bergeser linear dengan scrollY (delta scrollY → delta top yang sama)', () => {
    fc.assert(
      fc.property(
        rectArb,
        fc.float({ min: 0, max: 5000, noNaN: true }),
        fc.float({ min: 0, max: 5000, noNaN: true }),
        fc.float({ min: 0, max: 5000, noNaN: true }),
        (rect, scrollX, scrollY1, scrollY2) => {
          const pos1 = computeDropdownPosition(rect, scrollX, scrollY1);
          const pos2 = computeDropdownPosition(rect, scrollX, scrollY2);
          // Difference in top must equal difference in scrollY
          expect(pos2.top - pos1.top).toBeCloseTo(scrollY2 - scrollY1, 5);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('left bergeser linear dengan scrollX (delta scrollX → delta left yang sama)', () => {
    fc.assert(
      fc.property(
        rectArb,
        fc.float({ min: 0, max: 5000, noNaN: true }),
        fc.float({ min: 0, max: 5000, noNaN: true }),
        fc.float({ min: 0, max: 5000, noNaN: true }),
        (rect, scrollY, scrollX1, scrollX2) => {
          const pos1 = computeDropdownPosition(rect, scrollX1, scrollY);
          const pos2 = computeDropdownPosition(rect, scrollX2, scrollY);
          expect(pos2.left - pos1.left).toBeCloseTo(scrollX2 - scrollX1, 5);
        },
      ),
      { numRuns: 100 },
    );
  });
});
