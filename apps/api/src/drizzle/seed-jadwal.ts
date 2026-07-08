/**
 * Jadwal Seed Script (Incremental)
 *
 * Adds to existing seed data:
 * - 3 additional guru (guru3, guru4, guru5) — total 5 guru
 * - 36 jadwal_pelajaran entries for Kelas 1A (Senin-Sabtu, 6 slots/day)
 *
 * Time slots match the admin panel's grid (40 min each):
 *   Slot 1: 07:00-07:40 | Slot 2: 07:40-08:20 | Slot 3: 08:20-09:00
 *   Slot 4: 09:00-09:40 | Slot 5: 09:40-10:20 | Slot 6: 10:20-11:00
 *
 * Safe to run multiple times — clears Kelas 1A jadwal before inserting.
 *
 * Usage: DATABASE_URL=... npx ts-node -r tsconfig-paths/register src/drizzle/seed-jadwal.ts
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import { sql } from 'drizzle-orm';

import { user } from './schema/user';
import { jadwalPelajaran } from './schema/jadwal';

// Reuse IDs from main seed
const IDS = {
  tenant: '00000000-0000-4000-a000-000000000001',
  guru1: '00000000-0000-4000-a000-000000000012',
  guru2: '00000000-0000-4000-a000-000000000013',
  guru3: '00000000-0000-4000-a000-000000000017',
  guru4: '00000000-0000-4000-a000-000000000018',
  guru5: '00000000-0000-4000-a000-000000000019',
  tahunAjaran: '00000000-0000-4000-a000-000000000020',
  kelas1A: '00000000-0000-4000-a000-000000000030',
  mapelMtk: '00000000-0000-4000-a000-000000000040',
  mapelBindo: '00000000-0000-4000-a000-000000000041',
  mapelIpa: '00000000-0000-4000-a000-000000000042',
  mapelIps: '00000000-0000-4000-a000-000000000043',
  mapelBing: '00000000-0000-4000-a000-000000000044',
} as const;

async function seedJadwal() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  console.log('🌱 Starting jadwal seed (incremental)...');

  try {
    const passwordHash = await bcrypt.hash('password123', 10);

    // 1. Add 3 new guru (ON CONFLICT DO NOTHING — safe for re-runs)
    console.log('  → Adding guru3, guru4, guru5...');
    await db
      .insert(user)
      .values([
        {
          id: IDS.guru3,
          tenantId: IDS.tenant,
          nama: 'Ratna Dewi, S.Pd.',
          email: 'ratna.dewi@sekolahcontoh.sch.id',
          passwordHash,
          role: 'guru',
          isActive: true,
        },
        {
          id: IDS.guru4,
          tenantId: IDS.tenant,
          nama: 'Hasan Basri, S.Pd.',
          email: 'hasan.basri@sekolahcontoh.sch.id',
          passwordHash,
          role: 'guru',
          isActive: true,
        },
        {
          id: IDS.guru5,
          tenantId: IDS.tenant,
          nama: 'Yuliana Sari, S.Pd.',
          email: 'yuliana.sari@sekolahcontoh.sch.id',
          passwordHash,
          role: 'guru',
          isActive: true,
        },
      ])
      .onConflictDoNothing();

    // 2. Clear existing jadwal for Kelas 1A (to allow re-seeding cleanly)
    console.log('  → Clearing existing jadwal for Kelas 1A...');
    await db.delete(jadwalPelajaran).where(sql`${jadwalPelajaran.kelasId} = ${IDS.kelas1A}`);

    // 3. Insert jadwal pelajaran for Kelas 1A, Senin-Sabtu
    // ─── Time slots (must match admin panel's deriveJamKe timeMap) ────────
    //   Slot 1: 07:00-07:40  |  Slot 2: 07:40-08:20  |  Slot 3: 08:20-09:00
    //   Slot 4: 09:00-09:40  |  Slot 5: 09:40-10:20  |  Slot 6: 10:20-11:00
    //
    // Guru → Mapel mapping:
    //   guru1 (Siti Rahayu)    → MTK
    //   guru2 (Ahmad Wijaya)   → BIND
    //   guru3 (Ratna Dewi)     → IPA
    //   guru4 (Hasan Basri)    → IPS
    //   guru5 (Yuliana Sari)   → BING
    //
    // Constraint: max 2 slots per guru per day, no time conflicts.
    // ─────────────────────────────────────────────────────────────────────
    console.log('  → Inserting 36 jadwal entries (Kelas 1A, Senin-Sabtu)...');

    const jadwalData = [
      // ═══ SENIN ═══ (Guru1: slot 1-2, Guru2: slot 3-4, Guru3: slot 5-6)
      {
        hari: 'senin',
        jamMulai: '07:00',
        jamSelesai: '07:40',
        guruId: IDS.guru1,
        mapelId: IDS.mapelMtk,
      },
      {
        hari: 'senin',
        jamMulai: '07:40',
        jamSelesai: '08:20',
        guruId: IDS.guru1,
        mapelId: IDS.mapelMtk,
      },
      {
        hari: 'senin',
        jamMulai: '08:20',
        jamSelesai: '09:00',
        guruId: IDS.guru2,
        mapelId: IDS.mapelBindo,
      },
      {
        hari: 'senin',
        jamMulai: '09:00',
        jamSelesai: '09:40',
        guruId: IDS.guru2,
        mapelId: IDS.mapelBindo,
      },
      {
        hari: 'senin',
        jamMulai: '09:40',
        jamSelesai: '10:20',
        guruId: IDS.guru3,
        mapelId: IDS.mapelIpa,
      },
      {
        hari: 'senin',
        jamMulai: '10:20',
        jamSelesai: '11:00',
        guruId: IDS.guru3,
        mapelId: IDS.mapelIpa,
      },

      // ═══ SELASA ═══ (Guru4: slot 1-2, Guru5: slot 3-4, Guru1: slot 5-6)
      {
        hari: 'selasa',
        jamMulai: '07:00',
        jamSelesai: '07:40',
        guruId: IDS.guru4,
        mapelId: IDS.mapelIps,
      },
      {
        hari: 'selasa',
        jamMulai: '07:40',
        jamSelesai: '08:20',
        guruId: IDS.guru4,
        mapelId: IDS.mapelIps,
      },
      {
        hari: 'selasa',
        jamMulai: '08:20',
        jamSelesai: '09:00',
        guruId: IDS.guru5,
        mapelId: IDS.mapelBing,
      },
      {
        hari: 'selasa',
        jamMulai: '09:00',
        jamSelesai: '09:40',
        guruId: IDS.guru5,
        mapelId: IDS.mapelBing,
      },
      {
        hari: 'selasa',
        jamMulai: '09:40',
        jamSelesai: '10:20',
        guruId: IDS.guru1,
        mapelId: IDS.mapelMtk,
      },
      {
        hari: 'selasa',
        jamMulai: '10:20',
        jamSelesai: '11:00',
        guruId: IDS.guru1,
        mapelId: IDS.mapelMtk,
      },

      // ═══ RABU ═══ (Guru2: slot 1-2, Guru3: slot 3-4, Guru4: slot 5-6)
      {
        hari: 'rabu',
        jamMulai: '07:00',
        jamSelesai: '07:40',
        guruId: IDS.guru2,
        mapelId: IDS.mapelBindo,
      },
      {
        hari: 'rabu',
        jamMulai: '07:40',
        jamSelesai: '08:20',
        guruId: IDS.guru2,
        mapelId: IDS.mapelBindo,
      },
      {
        hari: 'rabu',
        jamMulai: '08:20',
        jamSelesai: '09:00',
        guruId: IDS.guru3,
        mapelId: IDS.mapelIpa,
      },
      {
        hari: 'rabu',
        jamMulai: '09:00',
        jamSelesai: '09:40',
        guruId: IDS.guru3,
        mapelId: IDS.mapelIpa,
      },
      {
        hari: 'rabu',
        jamMulai: '09:40',
        jamSelesai: '10:20',
        guruId: IDS.guru4,
        mapelId: IDS.mapelIps,
      },
      {
        hari: 'rabu',
        jamMulai: '10:20',
        jamSelesai: '11:00',
        guruId: IDS.guru4,
        mapelId: IDS.mapelIps,
      },

      // ═══ KAMIS ═══ (Guru5: slot 1-2, Guru1: slot 3-4, Guru2: slot 5-6)
      {
        hari: 'kamis',
        jamMulai: '07:00',
        jamSelesai: '07:40',
        guruId: IDS.guru5,
        mapelId: IDS.mapelBing,
      },
      {
        hari: 'kamis',
        jamMulai: '07:40',
        jamSelesai: '08:20',
        guruId: IDS.guru5,
        mapelId: IDS.mapelBing,
      },
      {
        hari: 'kamis',
        jamMulai: '08:20',
        jamSelesai: '09:00',
        guruId: IDS.guru1,
        mapelId: IDS.mapelMtk,
      },
      {
        hari: 'kamis',
        jamMulai: '09:00',
        jamSelesai: '09:40',
        guruId: IDS.guru1,
        mapelId: IDS.mapelMtk,
      },
      {
        hari: 'kamis',
        jamMulai: '09:40',
        jamSelesai: '10:20',
        guruId: IDS.guru2,
        mapelId: IDS.mapelBindo,
      },
      {
        hari: 'kamis',
        jamMulai: '10:20',
        jamSelesai: '11:00',
        guruId: IDS.guru2,
        mapelId: IDS.mapelBindo,
      },

      // ═══ JUMAT ═══ (Guru3: slot 1-2, Guru4: slot 3-4, Guru5: slot 5-6)
      {
        hari: 'jumat',
        jamMulai: '07:00',
        jamSelesai: '07:40',
        guruId: IDS.guru3,
        mapelId: IDS.mapelIpa,
      },
      {
        hari: 'jumat',
        jamMulai: '07:40',
        jamSelesai: '08:20',
        guruId: IDS.guru3,
        mapelId: IDS.mapelIpa,
      },
      {
        hari: 'jumat',
        jamMulai: '08:20',
        jamSelesai: '09:00',
        guruId: IDS.guru4,
        mapelId: IDS.mapelIps,
      },
      {
        hari: 'jumat',
        jamMulai: '09:00',
        jamSelesai: '09:40',
        guruId: IDS.guru4,
        mapelId: IDS.mapelIps,
      },
      {
        hari: 'jumat',
        jamMulai: '09:40',
        jamSelesai: '10:20',
        guruId: IDS.guru5,
        mapelId: IDS.mapelBing,
      },
      {
        hari: 'jumat',
        jamMulai: '10:20',
        jamSelesai: '11:00',
        guruId: IDS.guru5,
        mapelId: IDS.mapelBing,
      },

      // ═══ SABTU ═══ (Guru2: slot 1-2, Guru5: slot 3-4, Guru1: slot 5-6)
      {
        hari: 'sabtu',
        jamMulai: '07:00',
        jamSelesai: '07:40',
        guruId: IDS.guru2,
        mapelId: IDS.mapelBindo,
      },
      {
        hari: 'sabtu',
        jamMulai: '07:40',
        jamSelesai: '08:20',
        guruId: IDS.guru2,
        mapelId: IDS.mapelBindo,
      },
      {
        hari: 'sabtu',
        jamMulai: '08:20',
        jamSelesai: '09:00',
        guruId: IDS.guru5,
        mapelId: IDS.mapelBing,
      },
      {
        hari: 'sabtu',
        jamMulai: '09:00',
        jamSelesai: '09:40',
        guruId: IDS.guru5,
        mapelId: IDS.mapelBing,
      },
      {
        hari: 'sabtu',
        jamMulai: '09:40',
        jamSelesai: '10:20',
        guruId: IDS.guru1,
        mapelId: IDS.mapelMtk,
      },
      {
        hari: 'sabtu',
        jamMulai: '10:20',
        jamSelesai: '11:00',
        guruId: IDS.guru1,
        mapelId: IDS.mapelMtk,
      },
    ];

    await db.insert(jadwalPelajaran).values(
      jadwalData.map((j) => ({
        tenantId: IDS.tenant,
        kelasId: IDS.kelas1A,
        mataPelajaranId: j.mapelId,
        guruId: j.guruId,
        tahunAjaranId: IDS.tahunAjaran,
        semester: 1,
        hari: j.hari,
        jamMulai: j.jamMulai,
        jamSelesai: j.jamSelesai,
        tanggalMulaiBerlaku: '2024-07-15',
        tanggalSelesaiBerlaku: '2025-06-30',
      })),
    );

    console.log('');
    console.log('✅ Jadwal seed completed!');
    console.log('');
    console.log('📋 Added:');
    console.log('   Guru baru:');
    console.log('     - ratna.dewi@sekolahcontoh.sch.id (guru - IPA)');
    console.log('     - hasan.basri@sekolahcontoh.sch.id (guru - IPS)');
    console.log('     - yuliana.sari@sekolahcontoh.sch.id (guru - BING)');
    console.log('   Password: password123');
    console.log('');
    console.log('📅 Jadwal Kelas 1A (36 slot, 40 min each):');
    console.log('   Senin  : MTK(2) → BIND(2) → IPA(2)');
    console.log('   Selasa : IPS(2) → BING(2) → MTK(2)');
    console.log('   Rabu   : BIND(2) → IPA(2) → IPS(2)');
    console.log('   Kamis  : BING(2) → MTK(2) → BIND(2)');
    console.log('   Jumat  : IPA(2) → IPS(2) → BING(2)');
    console.log('   Sabtu  : BIND(2) → BING(2) → MTK(2)');
    console.log('');
  } catch (error) {
    console.error('❌ Jadwal seed failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedJadwal();
