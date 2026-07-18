/**
 * Seed Script: Siswa Siap Lulus (3 Tahun Aktif)
 *
 * Script ini berdiri sendiri dan dijalankan SETELAH seed utama (seed.ts).
 * Membuat data untuk mensimulasikan siswa yang telah melalui 3 tahun ajaran:
 *
 * - Tahun ajaran 2024/2025 (existing, diupdate ke nonaktif) → siswa di tingkat 1
 * - Tahun ajaran 2025/2026 (baru, nonaktif) → siswa naik ke tingkat 2
 * - Tahun ajaran 2026/2027 (baru, aktif) → siswa sekarang di tingkat 3
 *
 * Siswa yang digunakan: 10 siswa existing dari seed utama.
 * Kelas: menggunakan kelas 3A existing + kelas baru untuk tahun ajaran lama.
 *
 * Usage: npx ts-node -r tsconfig-paths/register src/drizzle/seed-lulus.ts
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { eq, and } from 'drizzle-orm';

import { tahunAjaran } from './schema/tahun-ajaran';
import { kelas } from './schema/kelas';
import { siswa } from './schema/siswa';
import { riwayatKelas } from './schema/konfigurasi';

// ─── Reference IDs from main seed ────────────────────────────────────────────
const IDS = {
  tenant: '00000000-0000-4000-a000-000000000001',
  guru1: '00000000-0000-4000-a000-000000000012',
  guru2: '00000000-0000-4000-a000-000000000013',
  guru3: '00000000-0000-4000-a000-000000000017',
  tahunAjaran2024: '00000000-0000-4000-a000-000000000020', // existing 2024/2025

  // New IDs for this seed
  tahunAjaran2025: '00000000-0000-4000-a000-000000000021', // 2025/2026
  tahunAjaran2026: '00000000-0000-4000-a000-000000000022', // 2026/2027

  // Kelas tingkat 1 untuk 2024/2025 (reuse existing kelas1A)
  kelas1A_2024: '00000000-0000-4000-a000-000000000030', // existing

  // Kelas tingkat 2 untuk 2025/2026
  kelas2A_2025: '00000000-0000-4000-a000-000000000033',

  // Kelas tingkat 3 untuk 2026/2027
  kelas3A_2026: '00000000-0000-4000-a000-000000000034',

  // All 10 siswa from main seed
  siswa: [
    '00000000-0000-4000-a000-000000000050',
    '00000000-0000-4000-a000-000000000051',
    '00000000-0000-4000-a000-000000000052',
    '00000000-0000-4000-a000-000000000053',
    '00000000-0000-4000-a000-000000000054',
    '00000000-0000-4000-a000-000000000055',
    '00000000-0000-4000-a000-000000000056',
    '00000000-0000-4000-a000-000000000057',
    '00000000-0000-4000-a000-000000000058',
    '00000000-0000-4000-a000-000000000059',
  ],
} as const;

async function seedLulus() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  console.log('🎓 Starting seed-lulus (siswa siap lulus)...');
  console.log('');

  try {
    // ─── 1. Update tahun ajaran 2024/2025 to nonaktif ──────────────────
    console.log('  → Updating tahun ajaran 2024/2025 → nonaktif...');
    await db
      .update(tahunAjaran)
      .set({ status: 'nonaktif' })
      .where(eq(tahunAjaran.id, IDS.tahunAjaran2024));

    // ─── 2. Create tahun ajaran 2025/2026 (nonaktif) ───────────────────
    console.log('  → Creating tahun ajaran 2025/2026 (nonaktif)...');
    await db.insert(tahunAjaran).values({
      id: IDS.tahunAjaran2025,
      tenantId: IDS.tenant,
      nama: '2025/2026',
      tanggalMulai: '2025-07-14',
      tanggalSelesai: '2026-06-30',
      status: 'nonaktif',
    });

    // ─── 3. Create tahun ajaran 2026/2027 (aktif) ──────────────────────
    console.log('  → Creating tahun ajaran 2026/2027 (aktif)...');
    await db.insert(tahunAjaran).values({
      id: IDS.tahunAjaran2026,
      tenantId: IDS.tenant,
      nama: '2026/2027',
      tanggalMulai: '2026-07-13',
      tanggalSelesai: '2027-06-30',
      status: 'aktif',
    });

    // ─── 4. Create kelas tingkat 2 untuk 2025/2026 ─────────────────────
    console.log('  → Creating kelas 2A (2025/2026)...');
    await db.insert(kelas).values({
      id: IDS.kelas2A_2025,
      tenantId: IDS.tenant,
      tahunAjaranId: IDS.tahunAjaran2025,
      nama: '2A',
      tingkat: 2,
      waliKelasId: IDS.guru2,
      kapasitas: 30,
    });

    // ─── 5. Create kelas tingkat 3 untuk 2026/2027 ─────────────────────
    console.log('  → Creating kelas 3A (2026/2027)...');
    await db.insert(kelas).values({
      id: IDS.kelas3A_2026,
      tenantId: IDS.tenant,
      tahunAjaranId: IDS.tahunAjaran2026,
      nama: '3A',
      tingkat: 3,
      waliKelasId: IDS.guru3,
      kapasitas: 30,
    });

    // ─── 6. Move all siswa to kelas 3A 2026/2027 (current class) ───────
    console.log('  → Moving 10 siswa to kelas 3A (2026/2027)...');
    for (const siswaId of IDS.siswa) {
      await db
        .update(siswa)
        .set({ kelasId: IDS.kelas3A_2026, updatedAt: new Date() })
        .where(and(eq(siswa.id, siswaId), eq(siswa.tenantId, IDS.tenant)));
    }

    // ─── 7. Insert riwayat_kelas for year 1 (2024/2025, tingkat 1) ─────
    console.log('  → Recording riwayat kelas tahun 1 (2024/2025, kelas 1A)...');
    await db.insert(riwayatKelas).values(
      IDS.siswa.map((siswaId) => ({
        tenantId: IDS.tenant,
        siswaId,
        kelasId: IDS.kelas1A_2024,
        tahunAjaranId: IDS.tahunAjaran2024,
        tanggalMulai: '2024-07-15',
      })),
    );

    // ─── 8. Insert riwayat_kelas for year 2 (2025/2026, tingkat 2) ─────
    console.log('  → Recording riwayat kelas tahun 2 (2025/2026, kelas 2A)...');
    await db.insert(riwayatKelas).values(
      IDS.siswa.map((siswaId) => ({
        tenantId: IDS.tenant,
        siswaId,
        kelasId: IDS.kelas2A_2025,
        tahunAjaranId: IDS.tahunAjaran2025,
        tanggalMulai: '2025-07-14',
      })),
    );

    // ─── 9. Insert riwayat_kelas for year 3 (2026/2027, tingkat 3) ─────
    console.log('  → Recording riwayat kelas tahun 3 (2026/2027, kelas 3A)...');
    await db.insert(riwayatKelas).values(
      IDS.siswa.map((siswaId) => ({
        tenantId: IDS.tenant,
        siswaId,
        kelasId: IDS.kelas3A_2026,
        tahunAjaranId: IDS.tahunAjaran2026,
        tanggalMulai: '2026-07-13',
      })),
    );

    console.log('');
    console.log('✅ Seed-lulus completed!');
    console.log('');
    console.log('📋 Summary:');
    console.log('   Tahun Ajaran:');
    console.log('     - 2024/2025 → nonaktif');
    console.log('     - 2025/2026 → nonaktif (baru)');
    console.log('     - 2026/2027 → aktif (baru)');
    console.log('');
    console.log('   Kelas:');
    console.log('     - 1A (2024/2025) — existing, wali: Siti Rahayu');
    console.log('     - 2A (2025/2026) — baru, wali: Ahmad Wijaya');
    console.log('     - 3A (2026/2027) — baru, wali: Ratna Dewi');
    console.log('');
    console.log('   Siswa (10, semua aktif di kelas 3A 2026/2027):');
    console.log('     - Andi Gunawan, Lisa Gunawan, Dimas Prasetyo');
    console.log('     - Putri Wati, Rafi Hakim, Maya Sari');
    console.log('     - Rizki Pratama, Nadia Permata, Fajar Nugroho');
    console.log('     - Salsabila Azzahra');
    console.log('');
    console.log('   Riwayat Kelas (per siswa):');
    console.log('     Tahun 1: 2024/2025 → Kelas 1A (tingkat 1)');
    console.log('     Tahun 2: 2025/2026 → Kelas 2A (tingkat 2)');
    console.log('     Tahun 3: 2026/2027 → Kelas 3A (tingkat 3)');
    console.log('');
    console.log('   🎓 Untuk test fitur lulus:');
    console.log('     - Kenaikan kelas dari 3A (2026/2027) → tidak ada tingkat 4');
    console.log('     - is_highest_grade = true');
    console.log('     - Siswa bisa ditandai lulus via lulus_ids');
    console.log('');
  } catch (error) {
    console.error('❌ Seed-lulus failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedLulus();
