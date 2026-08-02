// Feature: tenant-excel-onboarding
// useExcelParser — pure async functions for parsing Excel onboarding files via SheetJS.
// No reactive state here; state lives in useOnboardingForm.

import * as XLSX from 'xlsx';

export interface ParsedSiswa {
  nama: string;
  nisn?: string;
  kelas?: string; // kelasNama for backend lookup
  jenisKelamin?: 'L' | 'P';
  tanggalLahir?: string | null; // ISO YYYY-MM-DD or null
  alamat?: string;
  namaWali?: string;
  teleponWali?: string;
  isValid: boolean;
  reason?: string;
}

export interface ParsedKelas {
  nama: string;
  tingkat: number;
}

export interface ParsedMataPelajaran {
  nama: string;
  kode?: string;
  isValid: boolean;
  reason?: string;
}

export interface ParsedGuruStaff {
  nama: string;
  email: string;
  telepon?: string;
  role: string;
  isValid: boolean;
  reason?: string;
}

export interface ParsedSppBulanan {
  tingkat: number | null;
  nominal: number | null;
  isValid: boolean;
  reason?: string;
}

export interface ParsedOnboardingData {
  siswa: ParsedSiswa[];
  kelas: ParsedKelas[];
  mataPelajaran: ParsedMataPelajaran[];
  guruStaff: ParsedGuruStaff[];
  sppBulanan: ParsedSppBulanan[];
}

export interface ParseResult {
  data: ParsedOnboardingData | null;
  errors: string[]; // fatal errors — parsing halted
  warnings: string[]; // non-fatal — some rows skipped
  isValid: boolean;
}

// ---------------------------------------------------------------------------
// Internal parsers — called by parseExcelFile (task 6.6)
// ---------------------------------------------------------------------------

function parseSheetKelas(ws: XLSX.WorkSheet): ParsedKelas[] {
  const result: ParsedKelas[] = [];
  const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });

  if (data.length < 2) return result;

  const headerRow = data[0] as unknown[];

  // Find columns matching /^tingkat_(\d+)$/ with N in 1–12
  // Strict (no 'i' flag): case-sensitive, lowercase only.
  // Also reject leading zeros (e.g. tingkat_01): the captured group must
  // either be a single digit OR start with a non-zero digit.
  const tingkatCols: { colIndex: number; tingkat: number }[] = [];
  headerRow.forEach((header, idx) => {
    const match = String(header)
      .trim()
      .match(/^tingkat_(\d+)$/); // case-sensitive — 'i' flag removed
    if (match) {
      const raw = match[1];
      // Reject leading zeros: "01", "007", etc.
      if (raw.length > 1 && raw[0] === '0') return;
      const n = parseInt(raw, 10);
      if (n >= 1 && n <= 12) {
        tingkatCols.push({ colIndex: idx, tingkat: n });
      }
    }
  });

  // Process data rows (skip header at index 0)
  for (let rowIdx = 1; rowIdx < data.length; rowIdx++) {
    const row = data[rowIdx] as unknown[];
    for (const { colIndex, tingkat } of tingkatCols) {
      const cell = row[colIndex];
      const nama = cell !== undefined && cell !== null ? String(cell).trim() : '';
      if (nama !== '') {
        result.push({ nama, tingkat });
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// parseSheetSiswa — task 6.4
// ---------------------------------------------------------------------------

/** Format {y, m, d} numbers to ISO YYYY-MM-DD */
function formatDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Parse a raw `tanggal_lahir` cell value to ISO `YYYY-MM-DD` or `null`.
 *
 * Strategy (Property 28):
 *   1. Finite number → Excel date serial via XLSX.SSF.parse_date_code → YYYY-MM-DD
 *   2. Non-empty string → new Date(str) → YYYY-MM-DD if valid
 *   3. Anything else → null
 *
 * Never returns a malformed string.
 */
function parseTanggalLahir(raw: unknown): string | null {
  if (typeof raw === 'number' && isFinite(raw)) {
    try {
      const dt = XLSX.SSF.parse_date_code(raw);
      if (dt && dt.y && dt.m && dt.d) {
        return formatDate(dt.y, dt.m, dt.d);
      }
    } catch {
      // fall through to null
    }
    return null;
  }

  if (typeof raw === 'string' && raw.trim() !== '') {
    const d = new Date(raw.trim());
    if (!isNaN(d.getTime())) {
      return formatDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
    }
  }

  return null;
}

/**
 * Parse Sheet_Siswa from an XLSX WorkSheet.
 *
 * Uses `{ defval: null, raw: true }` so date serials arrive as numbers.
 *
 * Column mapping:
 *   nama            → nama           (required; row invalid if missing/empty)
 *   nisn            → nisn           (optional)
 *   kelas           → kelas          (optional, kelasNama for backend lookup)
 *   jenis_kelamin   → jenisKelamin   (first letter 'L'|'P', case-insensitive)
 *   tanggal_lahir   → tanggalLahir   (Excel serial or date string → ISO | null)
 *   alamat          → alamat         (optional)
 *   nama_wali       → namaWali       (optional)
 *   telepon_wali    → teleponWali    (optional)
 */
function parseSheetSiswa(ws: XLSX.WorkSheet): ParsedSiswa[] {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: null,
    raw: true,
  });

  return rows.map((row): ParsedSiswa => {
    /** Extract a string cell, trim it; return undefined if empty/null */
    const str = (key: string): string | undefined => {
      const v = row[key];
      if (v === null || v === undefined) return undefined;
      const s = String(v).trim();
      return s === '' ? undefined : s;
    };

    const nama = str('nama') ?? '';

    if (!nama) {
      return {
        nama: '',
        isValid: false,
        reason: 'Kolom nama tidak boleh kosong',
      };
    }

    // jenisKelamin: accept first letter 'L' or 'P' (case-insensitive)
    let jenisKelamin: 'L' | 'P' | undefined;
    const jkRaw = str('jenis_kelamin');
    if (jkRaw !== undefined) {
      const firstLetter = jkRaw.charAt(0).toUpperCase();
      if (firstLetter === 'L' || firstLetter === 'P') {
        jenisKelamin = firstLetter;
      }
      // Unrecognized value → leave jenisKelamin undefined; row still valid
    }

    return {
      nama,
      nisn: str('nisn'),
      kelas: str('kelas'),
      jenisKelamin,
      tanggalLahir: parseTanggalLahir(row['tanggal_lahir']),
      alamat: str('alamat'),
      namaWali: str('nama_wali'),
      teleponWali: str('telepon_wali'),
      isValid: true,
    };
  });
}

// ---------------------------------------------------------------------------
// Stub exports — implementations provided in tasks 6.2–6.6
// ---------------------------------------------------------------------------

export function validateFileExtension(filename: string): { isValid: boolean; error?: string } {
  const lower = filename.toLowerCase();
  if (!lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
    return {
      isValid: false,
      error: 'Format file tidak valid. Gunakan file Excel (.xlsx atau .xls)',
    };
  }
  return { isValid: true };
}

export function validateFileSize(sizeBytes: number): { isValid: boolean; error?: string } {
  const MAX_SIZE = 10_485_760; // 10MB
  if (sizeBytes > MAX_SIZE) {
    return {
      isValid: false,
      error: 'Ukuran file melebihi batas maksimum 10MB',
    };
  }
  return { isValid: true };
}

const REQUIRED_SHEETS = [
  'Siswa',
  'Kelas',
  'Mata Pelajaran',
  'Guru & Staff',
  'SPP Bulanan',
] as const;

export async function parseExcelFile(file: File): Promise<ParseResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Validate extension
  const extResult = validateFileExtension(file.name);
  if (!extResult.isValid) {
    return { data: null, errors: [extResult.error!], warnings, isValid: false };
  }

  // 2. Validate size
  const sizeResult = validateFileSize(file.size);
  if (!sizeResult.isValid) {
    return { data: null, errors: [sizeResult.error!], warnings, isValid: false };
  }

  // 3. Read file
  let workbook: XLSX.WorkBook;
  try {
    const arrayBuffer = await file.arrayBuffer();
    workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array', cellDates: false });
  } catch {
    return {
      data: null,
      errors: ['File Excel tidak dapat dibaca. Pastikan file tidak rusak dan coba lagi'],
      warnings,
      isValid: false,
    };
  }

  // 4. Check required sheets
  const missingSheets = REQUIRED_SHEETS.filter((s) => !workbook.SheetNames.includes(s));
  if (missingSheets.length > 0) {
    return {
      data: null,
      errors: [`Sheet yang diperlukan tidak ditemukan: ${missingSheets.join(', ')}`],
      warnings,
      isValid: false,
    };
  }

  // 5. Parse all sheets
  let siswa: ParsedSiswa[] = [];
  let kelas: ParsedKelas[] = [];
  let mataPelajaran: ParsedMataPelajaran[] = [];
  let guruStaff: ParsedGuruStaff[] = [];
  let sppBulanan: ParsedSppBulanan[] = [];

  try {
    siswa = parseSheetSiswa(workbook.Sheets['Siswa']);
    kelas = parseSheetKelas(workbook.Sheets['Kelas']);
    mataPelajaran = parseSheetMataPelajaran(workbook.Sheets['Mata Pelajaran']);
    guruStaff = parseSheetGuruStaff(workbook.Sheets['Guru & Staff']);
    sppBulanan = parseSheetSpp(workbook.Sheets['SPP Bulanan']);
  } catch {
    return {
      data: null,
      errors: ['File Excel tidak dapat dibaca. Pastikan file tidak rusak dan coba lagi'],
      warnings,
      isValid: false,
    };
  }

  // 6. Collect warnings for invalid rows
  const invalidSiswa = siswa.filter((r) => !r.isValid).length;
  if (invalidSiswa > 0) warnings.push(`${invalidSiswa} baris siswa tidak valid dan akan dilewati`);

  const invalidGuruStaff = guruStaff.filter((r) => !r.isValid).length;
  if (invalidGuruStaff > 0)
    warnings.push(`${invalidGuruStaff} baris guru/staff tidak valid dan akan dilewati`);

  const invalidSpp = sppBulanan.filter((r) => !r.isValid).length;
  if (invalidSpp > 0) warnings.push(`${invalidSpp} baris SPP tidak valid dan akan dilewati`);

  // 7. Check isValid: no fatal errors AND at least 1 sheet has ≥1 data row
  const hasData =
    siswa.length > 0 ||
    kelas.length > 0 ||
    mataPelajaran.length > 0 ||
    guruStaff.length > 0 ||
    sppBulanan.length > 0;

  const data: ParsedOnboardingData = { siswa, kelas, mataPelajaran, guruStaff, sppBulanan };

  return {
    data,
    errors,
    warnings,
    isValid: errors.length === 0 && hasData,
  };
}

// ---------------------------------------------------------------------------
// parseSheetMataPelajaran — task 6.5
// ---------------------------------------------------------------------------

function parseSheetMataPelajaran(ws: XLSX.WorkSheet): ParsedMataPelajaran[] {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
  return rows.map((row) => {
    const rawNama = row['mata_pelajaran'];
    const rawKode = row['kode'];

    const nama = rawNama !== null && rawNama !== undefined ? String(rawNama).trim() : '';
    const kode =
      rawKode !== null && rawKode !== undefined ? String(rawKode).trim() || undefined : undefined;

    if (nama === '') {
      return { nama: '', kode, isValid: false, reason: 'Nama mata pelajaran tidak boleh kosong' };
    }

    return { nama, kode, isValid: true };
  });
}

// ---------------------------------------------------------------------------
// parseSheetGuruStaff — task 6.5
// ---------------------------------------------------------------------------

const VALID_ROLES = ['admin', 'guru', 'kepala_sekolah', 'bendahara'] as const;

function isEmailValid(email: string): boolean {
  // Must contain '@' and the part after '@' must contain '.'
  const atIdx = email.indexOf('@');
  if (atIdx === -1) return false;
  const domain = email.slice(atIdx + 1);
  return domain.includes('.');
}

function parseSheetGuruStaff(ws: XLSX.WorkSheet): ParsedGuruStaff[] {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
  return rows.map((row) => {
    const nama =
      row['nama'] !== null && row['nama'] !== undefined ? String(row['nama']).trim() : '';
    const email =
      row['email'] !== null && row['email'] !== undefined ? String(row['email']).trim() : '';
    const teleponRaw = row['telepon'];
    const telepon =
      teleponRaw !== null && teleponRaw !== undefined
        ? String(teleponRaw).trim() || undefined
        : undefined;
    const role =
      row['role'] !== null && row['role'] !== undefined ? String(row['role']).trim() : '';

    const roleValid = (VALID_ROLES as readonly string[]).includes(role);
    const emailValid = email !== '' && isEmailValid(email);

    const reasons: string[] = [];
    if (!roleValid) reasons.push(`Role tidak valid: ${role}`);
    if (!emailValid) reasons.push('Format email tidak valid');

    if (reasons.length > 0) {
      return { nama, email, telepon, role, isValid: false, reason: reasons.join('; ') };
    }

    return { nama, email, telepon, role, isValid: true };
  });
}

// ---------------------------------------------------------------------------
// parseSheetSpp — task 6.5
// ---------------------------------------------------------------------------

function parseSheetSpp(ws: XLSX.WorkSheet): ParsedSppBulanan[] {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
  return rows.map((row) => {
    // Parse tingkat
    const rawTingkat = row['tingkat'];
    let tingkat: number | null = null;
    if (rawTingkat !== null && rawTingkat !== undefined) {
      const parsed = parseInt(String(rawTingkat).trim(), 10);
      if (!isNaN(parsed) && parsed > 0) {
        tingkat = parsed;
      }
    }

    // Parse nominal — if already a number check sign first, otherwise strip non-digit chars
    const rawNominal = row['nominal'];
    let nominal: number | null = null;
    if (rawNominal !== null && rawNominal !== undefined) {
      if (typeof rawNominal === 'number') {
        // Numeric cell: respect the sign — negative or zero is invalid
        if (isFinite(rawNominal) && rawNominal > 0) {
          nominal = Math.trunc(rawNominal);
        }
      } else {
        const stripped = String(rawNominal).replace(/\D/g, '');
        if (stripped !== '') {
          const parsed = parseInt(stripped, 10);
          if (!isNaN(parsed) && parsed > 0) {
            nominal = parsed;
          }
        }
      }
    }

    const reasons: string[] = [];
    if (tingkat === null) reasons.push('Tingkat tidak valid');
    if (nominal === null) reasons.push('Nominal tidak valid');

    if (reasons.length > 0) {
      return { tingkat, nominal, isValid: false, reason: reasons.join('; ') };
    }

    return { tingkat, nominal, isValid: true };
  });
}
