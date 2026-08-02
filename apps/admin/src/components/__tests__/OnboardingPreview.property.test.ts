// Feature: tenant-excel-onboarding
// Property tests for OnboardingPreview component rendering (Properties 9, 10, 11)

import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import fc from 'fast-check';
import OnboardingPreview from '../OnboardingPreview.vue';
import type {
  ParsedOnboardingData,
  ParsedSiswa,
  ParsedKelas,
  ParsedMataPelajaran,
  ParsedGuruStaff,
  ParsedSppBulanan,
} from '@/composables/useExcelParser';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const namaArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0);

const parsedSiswaArb = (isValid: boolean) =>
  fc.record<ParsedSiswa>({
    nama: namaArb,
    nisn: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
    kelas: fc.option(namaArb, { nil: undefined }),
    jenisKelamin: fc.option(fc.constantFrom('L' as const, 'P' as const), { nil: undefined }),
    tanggalLahir: fc.option(
      fc
        .date({ min: new Date('1990-01-01'), max: new Date('2020-12-31') })
        .map(
          (d) =>
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
        ),
      { nil: undefined },
    ),
    isValid: fc.constant(isValid),
    reason: isValid ? fc.constant(undefined) : fc.string({ minLength: 1, maxLength: 50 }),
  });

const parsedKelasArb = fc.record<ParsedKelas>({
  nama: namaArb,
  tingkat: fc.integer({ min: 1, max: 12 }),
});

const parsedMataPelajaranArb = fc.record<ParsedMataPelajaran>({
  nama: namaArb,
  kode: fc.option(fc.string({ minLength: 1, maxLength: 10 }), { nil: undefined }),
  isValid: fc.boolean(),
});

const parsedGuruStaffArb = (isValid: boolean) =>
  fc.record<ParsedGuruStaff>({
    nama: namaArb,
    email: fc
      .tuple(
        fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /^[a-zA-Z0-9]+$/.test(s)),
        fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /^[a-zA-Z0-9]+$/.test(s)),
        fc.string({ minLength: 2, maxLength: 5 }).filter((s) => /^[a-z]+$/.test(s)),
      )
      .map(([u, domain, tld]) => `${u}@${domain}.${tld}`),
    telepon: fc.option(fc.string({ minLength: 1, maxLength: 15 }), { nil: undefined }),
    role: fc.constantFrom('admin', 'guru', 'kepala_sekolah', 'bendahara'),
    isValid: fc.constant(isValid),
    reason: isValid ? fc.constant(undefined) : fc.string({ minLength: 1, maxLength: 50 }),
  });

const parsedSppArb = fc.record<ParsedSppBulanan>({
  tingkat: fc.option(fc.integer({ min: 1, max: 12 }), { nil: null }),
  nominal: fc.option(fc.integer({ min: 1, max: 10_000_000 }), { nil: null }),
  isValid: fc.boolean(),
});

/** Build a full ParsedOnboardingData with controlled sizes */
function buildDataArb(opts: {
  siswaCount?: fc.Arbitrary<number>;
  kelasCount?: fc.Arbitrary<number>;
  mataPelajaranCount?: fc.Arbitrary<number>;
  guruStaffCount?: fc.Arbitrary<number>;
  sppCount?: fc.Arbitrary<number>;
}) {
  return fc
    .tuple(
      opts.siswaCount ?? fc.integer({ min: 0, max: 20 }),
      opts.kelasCount ?? fc.integer({ min: 0, max: 20 }),
      opts.mataPelajaranCount ?? fc.integer({ min: 0, max: 20 }),
      opts.guruStaffCount ?? fc.integer({ min: 0, max: 20 }),
      opts.sppCount ?? fc.integer({ min: 0, max: 13 }),
    )
    .chain(([nS, nK, nMP, nGS, nSpp]) =>
      fc
        .tuple(
          fc.array(parsedSiswaArb(true), { minLength: nS, maxLength: nS }),
          fc.array(parsedKelasArb, { minLength: nK, maxLength: nK }),
          fc.array(parsedMataPelajaranArb, { minLength: nMP, maxLength: nMP }),
          fc.array(parsedGuruStaffArb(true), { minLength: nGS, maxLength: nGS }),
          fc.array(parsedSppArb, { minLength: nSpp, maxLength: nSpp }),
        )
        .map(([siswa, kelas, mataPelajaran, guruStaff, sppBulanan]) => ({
          data: { siswa, kelas, mataPelajaran, guruStaff, sppBulanan } as ParsedOnboardingData,
          counts: { nS, nK, nMP, nGS, nSpp },
        })),
    );
}

function mountPreview(data: ParsedOnboardingData) {
  return mount(OnboardingPreview, {
    props: { data, errors: [], warnings: [] },
  });
}

// ---------------------------------------------------------------------------
// Property 9: Preview summary counts match actual parsed array lengths
// **Validates: Requirements 3.2**
// ---------------------------------------------------------------------------

describe('Property 9: Preview summary counts match actual parsed array lengths', () => {
  // Feature: tenant-excel-onboarding, Property 9: Preview summary counts match actual parsed array lengths

  it('tab badge for Siswa equals data.siswa.length regardless of validity', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 30 }),
        fc.integer({ min: 0, max: 30 }),
        (nValid, nInvalid) => {
          const siswa = [
            ...Array.from({ length: nValid }, () => ({
              nama: 'Andi',
              isValid: true,
            })),
            ...Array.from({ length: nInvalid }, () => ({
              nama: 'Budi',
              isValid: false,
              reason: 'alasan',
            })),
          ] as ParsedSiswa[];

          const data: ParsedOnboardingData = {
            siswa,
            kelas: [],
            mataPelajaran: [],
            guruStaff: [],
            sppBulanan: [],
          };

          const wrapper = mountPreview(data);
          const total = nValid + nInvalid;

          // Find the Siswa tab button and check its badge
          const buttons = wrapper.findAll('button[type="button"]');
          const siswaBtn = buttons.find((b) => b.text().startsWith('Siswa'));
          expect(siswaBtn).toBeDefined();
          expect(siswaBtn!.text()).toContain(String(total));
        },
      ),
      { numRuns: 100 },
    );
  });

  it('all 5 tab badges display the exact array lengths', () => {
    fc.assert(
      fc.property(buildDataArb({}), ({ data, counts }) => {
        const wrapper = mountPreview(data);

        const buttons = wrapper.findAll('button[type="button"]');

        const siswaBtn = buttons.find((b) => b.text().startsWith('Siswa'));
        const kelasBtn = buttons.find((b) => b.text().startsWith('Kelas'));
        const mpBtn = buttons.find((b) => b.text().startsWith('Mata Pelajaran'));
        const gsBtn = buttons.find((b) => b.text().startsWith('Guru & Staff'));
        const sppBtn = buttons.find((b) => b.text().startsWith('SPP'));

        expect(siswaBtn?.text()).toContain(String(counts.nS));
        expect(kelasBtn?.text()).toContain(String(counts.nK));
        expect(mpBtn?.text()).toContain(String(counts.nMP));
        expect(gsBtn?.text()).toContain(String(counts.nGS));
        expect(sppBtn?.text()).toContain(String(counts.nSpp));
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 10: Row display is capped at 100 with overflow note
// **Validates: Requirements 3.3, 3.5, 3.6, 3.7**
// ---------------------------------------------------------------------------

describe('Property 10: Row display is capped at 100 with overflow note', () => {
  // Feature: tenant-excel-onboarding, Property 10: Row display is capped at 100 with overflow note

  it('Siswa tab: N ≤ 100 → exactly N rows shown, no overflow note', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (n) => {
        const siswa = Array.from(
          { length: n },
          (_, i) => ({ nama: `Siswa${i}`, isValid: true }) as ParsedSiswa,
        );
        const data: ParsedOnboardingData = {
          siswa,
          kelas: [],
          mataPelajaran: [],
          guruStaff: [],
          sppBulanan: [],
        };

        const wrapper = mountPreview(data);
        // Default tab is siswa — tbody rows
        const tbodyRows = wrapper.findAll('tbody tr');
        expect(tbodyRows).toHaveLength(n);

        // No overflow note
        expect(wrapper.text()).not.toContain('Menampilkan 100 dari');
      }),
      { numRuns: 50 },
    );
  });

  it('Siswa tab: N > 100 → exactly 100 rows shown, overflow note shows total N', () => {
    fc.assert(
      fc.property(fc.integer({ min: 101, max: 300 }), (n) => {
        const siswa = Array.from(
          { length: n },
          (_, i) => ({ nama: `Siswa${i}`, isValid: true }) as ParsedSiswa,
        );
        const data: ParsedOnboardingData = {
          siswa,
          kelas: [],
          mataPelajaran: [],
          guruStaff: [],
          sppBulanan: [],
        };

        const wrapper = mountPreview(data);
        const tbodyRows = wrapper.findAll('tbody tr');
        expect(tbodyRows).toHaveLength(100);

        // Overflow note present with correct total
        expect(wrapper.text()).toContain(`Menampilkan 100 dari ${n} baris`);
      }),
      { numRuns: 50 },
    );
  });

  it('Mata Pelajaran tab: N ≤ 100 → exactly N rows shown, no overflow note', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 100 }), async (n) => {
        const mataPelajaran = Array.from(
          { length: n },
          (_, i) => ({ nama: `Mapel${i}`, isValid: true }) as ParsedMataPelajaran,
        );
        const data: ParsedOnboardingData = {
          siswa: [],
          kelas: [],
          mataPelajaran,
          guruStaff: [],
          sppBulanan: [],
        };

        const wrapper = mountPreview(data);
        // Switch to mata-pelajaran tab
        const buttons = wrapper.findAll('button[type="button"]');
        const mpBtn = buttons.find((b) => b.text().startsWith('Mata Pelajaran'));
        await mpBtn!.trigger('click');
        await nextTick();

        const tbodyRows = wrapper.findAll('tbody tr');
        expect(tbodyRows).toHaveLength(n);
        expect(wrapper.text()).not.toContain('Menampilkan 100 dari');
      }),
      { numRuns: 30 },
    );
  });

  it('Mata Pelajaran tab: N > 100 → exactly 100 rows shown, overflow note shows total N', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 101, max: 250 }), async (n) => {
        const mataPelajaran = Array.from(
          { length: n },
          (_, i) => ({ nama: `Mapel${i}`, isValid: true }) as ParsedMataPelajaran,
        );
        const data: ParsedOnboardingData = {
          siswa: [],
          kelas: [],
          mataPelajaran,
          guruStaff: [],
          sppBulanan: [],
        };

        const wrapper = mountPreview(data);
        const buttons = wrapper.findAll('button[type="button"]');
        const mpBtn = buttons.find((b) => b.text().startsWith('Mata Pelajaran'));
        await mpBtn!.trigger('click');
        await nextTick();

        const tbodyRows = wrapper.findAll('tbody tr');
        expect(tbodyRows).toHaveLength(100);
        expect(wrapper.text()).toContain(`Menampilkan 100 dari ${n} baris`);
      }),
      { numRuns: 30 },
    );
  });

  it('Guru & Staff tab: N ≤ 100 → exactly N rows shown, no overflow note', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 100 }), async (n) => {
        const guruStaff = Array.from(
          { length: n },
          (_, i) =>
            ({
              nama: `Guru${i}`,
              email: `guru${i}@sekolah.id`,
              role: 'guru',
              isValid: true,
            }) as ParsedGuruStaff,
        );
        const data: ParsedOnboardingData = {
          siswa: [],
          kelas: [],
          mataPelajaran: [],
          guruStaff,
          sppBulanan: [],
        };

        const wrapper = mountPreview(data);
        const buttons = wrapper.findAll('button[type="button"]');
        const gsBtn = buttons.find((b) => b.text().startsWith('Guru & Staff'));
        await gsBtn!.trigger('click');
        await nextTick();

        const tbodyRows = wrapper.findAll('tbody tr');
        expect(tbodyRows).toHaveLength(n);
        expect(wrapper.text()).not.toContain('Menampilkan 100 dari');
      }),
      { numRuns: 30 },
    );
  });

  it('Guru & Staff tab: N > 100 → exactly 100 rows shown, overflow note shows total N', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 101, max: 250 }), async (n) => {
        const guruStaff = Array.from(
          { length: n },
          (_, i) =>
            ({
              nama: `Guru${i}`,
              email: `guru${i}@sekolah.id`,
              role: 'guru',
              isValid: true,
            }) as ParsedGuruStaff,
        );
        const data: ParsedOnboardingData = {
          siswa: [],
          kelas: [],
          mataPelajaran: [],
          guruStaff,
          sppBulanan: [],
        };

        const wrapper = mountPreview(data);
        const buttons = wrapper.findAll('button[type="button"]');
        const gsBtn = buttons.find((b) => b.text().startsWith('Guru & Staff'));
        await gsBtn!.trigger('click');
        await nextTick();

        const tbodyRows = wrapper.findAll('tbody tr');
        expect(tbodyRows).toHaveLength(100);
        expect(wrapper.text()).toContain(`Menampilkan 100 dari ${n} baris`);
      }),
      { numRuns: 30 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 11: Invalid rows are rendered with distinct styling
// **Validates: Requirements 3.8**
// ---------------------------------------------------------------------------

describe('Property 11: Invalid rows are rendered with distinct styling', () => {
  // Feature: tenant-excel-onboarding, Property 11: Invalid rows are rendered with distinct styling

  it('Siswa tab: invalid rows have bg-red-50 and border-l-red-400, valid rows do not', () => {
    fc.assert(
      fc.property(
        // At least 1 valid and 1 invalid to exercise both branches
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 1, max: 10 }),
        (nValid, nInvalid) => {
          const validRows: ParsedSiswa[] = Array.from({ length: nValid }, (_, i) => ({
            nama: `ValidSiswa${i}`,
            isValid: true,
          }));
          const invalidRows: ParsedSiswa[] = Array.from({ length: nInvalid }, (_, i) => ({
            nama: `InvalidSiswa${i}`,
            isValid: false,
            reason: 'alasan test',
          }));

          // Interleave so order is mixed
          const siswa = [...validRows, ...invalidRows];

          const data: ParsedOnboardingData = {
            siswa,
            kelas: [],
            mataPelajaran: [],
            guruStaff: [],
            sppBulanan: [],
          };

          const wrapper = mountPreview(data);
          const tbodyRows = wrapper.findAll('tbody tr');
          expect(tbodyRows).toHaveLength(Math.min(siswa.length, 100));

          tbodyRows.forEach((row, idx) => {
            const rowData = siswa[idx];
            const classes = row.attributes('class') ?? '';
            if (rowData.isValid === false) {
              // Invalid rows must have the distinct styling classes
              expect(classes).toContain('bg-red-50');
              expect(classes).toContain('border-l-red-400');
            } else {
              // Valid rows must NOT have invalid row classes
              expect(classes).not.toContain('bg-red-50');
              expect(classes).not.toContain('border-l-red-400');
            }
          });
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Siswa tab: invalid rows render a reason column', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim().length > 0),
        (nInvalid, reason) => {
          const siswa: ParsedSiswa[] = Array.from({ length: nInvalid }, (_, i) => ({
            nama: `Siswa${i}`,
            isValid: false,
            reason,
          }));

          const data: ParsedOnboardingData = {
            siswa,
            kelas: [],
            mataPelajaran: [],
            guruStaff: [],
            sppBulanan: [],
          };

          const wrapper = mountPreview(data);
          // The Alasan column header should be visible
          expect(wrapper.text()).toContain('Alasan');
          // The reason text should appear somewhere in the table
          expect(wrapper.text()).toContain(reason);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Guru & Staff tab: invalid rows have distinct styling, valid rows do not', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 1, max: 10 }),
        async (nValid, nInvalid) => {
          const validRows: ParsedGuruStaff[] = Array.from({ length: nValid }, (_, i) => ({
            nama: `ValidGuru${i}`,
            email: `guru${i}@sekolah.id`,
            role: 'guru',
            isValid: true,
          }));
          const invalidRows: ParsedGuruStaff[] = Array.from({ length: nInvalid }, (_, i) => ({
            nama: `InvalidGuru${i}`,
            email: `invalid-email-${i}`,
            role: 'unknown',
            isValid: false,
            reason: 'Role tidak valid',
          }));

          const guruStaff = [...validRows, ...invalidRows];

          const data: ParsedOnboardingData = {
            siswa: [],
            kelas: [],
            mataPelajaran: [],
            guruStaff,
            sppBulanan: [],
          };

          const wrapper = mountPreview(data);
          const buttons = wrapper.findAll('button[type="button"]');
          const gsBtn = buttons.find((b) => b.text().startsWith('Guru & Staff'));
          await gsBtn!.trigger('click');
          await nextTick();

          const tbodyRows = wrapper.findAll('tbody tr');
          expect(tbodyRows).toHaveLength(Math.min(guruStaff.length, 100));

          tbodyRows.forEach((row, idx) => {
            const rowData = guruStaff[idx];
            const classes = row.attributes('class') ?? '';
            if (!rowData.isValid) {
              expect(classes).toContain('bg-red-50');
              expect(classes).toContain('border-l-red-400');
            } else {
              expect(classes).not.toContain('bg-red-50');
              expect(classes).not.toContain('border-l-red-400');
            }
          });
        },
      ),
      { numRuns: 100 },
    );
  });

  it('valid-only siswa rows never get the invalid styling class', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 30 }), (n) => {
        const siswa: ParsedSiswa[] = Array.from({ length: n }, (_, i) => ({
          nama: `Siswa${i}`,
          isValid: true,
        }));

        const data: ParsedOnboardingData = {
          siswa,
          kelas: [],
          mataPelajaran: [],
          guruStaff: [],
          sppBulanan: [],
        };

        const wrapper = mountPreview(data);
        const tbodyRows = wrapper.findAll('tbody tr');

        tbodyRows.forEach((row) => {
          const classes = row.attributes('class') ?? '';
          expect(classes).not.toContain('bg-red-50');
          expect(classes).not.toContain('border-l-red-400');
        });

        // No Alasan column header when all valid
        const headers = wrapper.findAll('th');
        const hasAlasanHeader = headers.some((h) => h.text().trim() === 'Alasan');
        expect(hasAlasanHeader).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
