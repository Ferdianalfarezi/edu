/**
 * Development Seed Script
 *
 * Creates sample data for local development:
 * - 1 tenant (Sekolah Contoh)
 * - Users: 1 admin, 1 kepala_sekolah, 2 guru, 1 bendahara, 2 orang_tua
 * - 1 active tahun_ajaran (2024/2025)
 * - 3 kelas (1A, 2A, 3A)
 * - 7 siswa with parent linkage
 * - 5 mata_pelajaran
 *
 * Usage: npx ts-node -r tsconfig-paths/register src/drizzle/seed.ts
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

import { tenant } from './schema/tenant';
import { user } from './schema/user';
import { tahunAjaran } from './schema/tahun-ajaran';
import { kelas } from './schema/kelas';
import { siswa } from './schema/siswa';
import { mataPelajaran } from './schema/mata-pelajaran';
import { konfigurasiSekolah } from './schema/konfigurasi';

// Fixed UUIDs for deterministic seeding (allows re-running without conflicts)
const IDS = {
  tenant: '00000000-0000-4000-a000-000000000001',
  admin: '00000000-0000-4000-a000-000000000010',
  kepalaSekolah: '00000000-0000-4000-a000-000000000011',
  guru1: '00000000-0000-4000-a000-000000000012',
  guru2: '00000000-0000-4000-a000-000000000013',
  bendahara: '00000000-0000-4000-a000-000000000014',
  orangTua1: '00000000-0000-4000-a000-000000000015',
  orangTua2: '00000000-0000-4000-a000-000000000016',
  tahunAjaran: '00000000-0000-4000-a000-000000000020',
  kelas1A: '00000000-0000-4000-a000-000000000030',
  kelas2A: '00000000-0000-4000-a000-000000000031',
  kelas3A: '00000000-0000-4000-a000-000000000032',
  mapelMtk: '00000000-0000-4000-a000-000000000040',
  mapelBindo: '00000000-0000-4000-a000-000000000041',
  mapelIpa: '00000000-0000-4000-a000-000000000042',
  mapelIps: '00000000-0000-4000-a000-000000000043',
  mapelBing: '00000000-0000-4000-a000-000000000044',
  siswa1: '00000000-0000-4000-a000-000000000050',
  siswa2: '00000000-0000-4000-a000-000000000051',
  siswa3: '00000000-0000-4000-a000-000000000052',
  siswa4: '00000000-0000-4000-a000-000000000053',
  siswa5: '00000000-0000-4000-a000-000000000054',
  siswa6: '00000000-0000-4000-a000-000000000055',
  siswa7: '00000000-0000-4000-a000-000000000056',
} as const;

async function seed() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  console.log('🌱 Starting seed...');

  try {
    // Hash password once for all staff users
    const passwordHash = await bcrypt.hash('password123', 10);

    // 1. Create tenant
    console.log('  → Creating tenant...');
    await db.insert(tenant).values({
      id: IDS.tenant,
      nama: 'Sekolah Contoh',
      alamat: 'Jl. Pendidikan No. 1, Jakarta Selatan',
      telepon: '021-1234567',
      email: 'admin@sekolahcontoh.sch.id',
      isActive: true,
    });

    // 2. Create users
    console.log('  → Creating users...');
    await db.insert(user).values([
      {
        id: IDS.admin,
        tenantId: IDS.tenant,
        nama: 'Admin Sekolah',
        email: 'admin@sekolahcontoh.sch.id',
        passwordHash,
        role: 'admin',
        isActive: true,
      },
      {
        id: IDS.kepalaSekolah,
        tenantId: IDS.tenant,
        nama: 'Budi Santoso, M.Pd.',
        email: 'kepsek@sekolahcontoh.sch.id',
        passwordHash,
        role: 'kepala_sekolah',
        isActive: true,
      },
      {
        id: IDS.guru1,
        tenantId: IDS.tenant,
        nama: 'Siti Rahayu, S.Pd.',
        email: 'siti.rahayu@sekolahcontoh.sch.id',
        passwordHash,
        role: 'guru',
        isActive: true,
      },
      {
        id: IDS.guru2,
        tenantId: IDS.tenant,
        nama: 'Ahmad Wijaya, S.Pd.',
        email: 'ahmad.wijaya@sekolahcontoh.sch.id',
        passwordHash,
        role: 'guru',
        isActive: true,
      },
      {
        id: IDS.bendahara,
        tenantId: IDS.tenant,
        nama: 'Dewi Lestari',
        email: 'bendahara@sekolahcontoh.sch.id',
        passwordHash,
        role: 'bendahara',
        isActive: true,
      },
      // Orang tua: tenant_id = NULL per ADR-002 (cross-tenant parent model)
      {
        id: IDS.orangTua1,
        tenantId: null,
        nama: 'Hendra Gunawan',
        phone: '081234567890',
        role: 'orang_tua',
        isActive: true,
      },
      {
        id: IDS.orangTua2,
        tenantId: null,
        nama: 'Rina Wati',
        phone: '081298765432',
        role: 'orang_tua',
        isActive: true,
      },
    ]);

    // 3. Create tahun ajaran (active)
    console.log('  → Creating tahun ajaran...');
    await db.insert(tahunAjaran).values({
      id: IDS.tahunAjaran,
      tenantId: IDS.tenant,
      nama: '2024/2025',
      tanggalMulai: '2024-07-15',
      tanggalSelesai: '2025-06-30',
      status: 'aktif',
    });

    // 4. Create kelas (guru1 = wali 1A, guru2 = wali 2A)
    console.log('  → Creating kelas...');
    await db.insert(kelas).values([
      {
        id: IDS.kelas1A,
        tenantId: IDS.tenant,
        tahunAjaranId: IDS.tahunAjaran,
        nama: '1A',
        tingkat: 1,
        waliKelasId: IDS.guru1,
        kapasitas: 30,
      },
      {
        id: IDS.kelas2A,
        tenantId: IDS.tenant,
        tahunAjaranId: IDS.tahunAjaran,
        nama: '2A',
        tingkat: 2,
        waliKelasId: IDS.guru2,
        kapasitas: 30,
      },
      {
        id: IDS.kelas3A,
        tenantId: IDS.tenant,
        tahunAjaranId: IDS.tahunAjaran,
        nama: '3A',
        tingkat: 3,
        waliKelasId: null,
        kapasitas: 30,
      },
    ]);

    // 5. Create mata pelajaran
    console.log('  → Creating mata pelajaran...');
    await db.insert(mataPelajaran).values([
      { id: IDS.mapelMtk, tenantId: IDS.tenant, nama: 'Matematika', kode: 'MTK' },
      { id: IDS.mapelBindo, tenantId: IDS.tenant, nama: 'Bahasa Indonesia', kode: 'BIND' },
      { id: IDS.mapelIpa, tenantId: IDS.tenant, nama: 'Ilmu Pengetahuan Alam', kode: 'IPA' },
      { id: IDS.mapelIps, tenantId: IDS.tenant, nama: 'Ilmu Pengetahuan Sosial', kode: 'IPS' },
      { id: IDS.mapelBing, tenantId: IDS.tenant, nama: 'Bahasa Inggris', kode: 'BING' },
    ]);

    // 6. Create siswa with parent linkage
    console.log('  → Creating siswa...');
    await db.insert(siswa).values([
      // Kelas 1A — 3 siswa, orangTua1 has 2 children
      {
        id: IDS.siswa1,
        tenantId: IDS.tenant,
        kelasId: IDS.kelas1A,
        nama: 'Andi Gunawan',
        nisn: '0012345001',
        jenisKelamin: 'L',
        tanggalLahir: '2017-03-15',
        alamat: 'Jl. Melati No. 5, Jakarta',
        orangTuaId: IDS.orangTua1,
        status: 'aktif',
      },
      {
        id: IDS.siswa2,
        tenantId: IDS.tenant,
        kelasId: IDS.kelas1A,
        nama: 'Lisa Gunawan',
        nisn: '0012345002',
        jenisKelamin: 'P',
        tanggalLahir: '2017-08-22',
        alamat: 'Jl. Melati No. 5, Jakarta',
        orangTuaId: IDS.orangTua1,
        status: 'aktif',
      },
      {
        id: IDS.siswa3,
        tenantId: IDS.tenant,
        kelasId: IDS.kelas1A,
        nama: 'Dimas Prasetyo',
        nisn: '0012345003',
        jenisKelamin: 'L',
        tanggalLahir: '2017-01-10',
        alamat: 'Jl. Kenanga No. 12, Jakarta',
        orangTuaId: IDS.orangTua2,
        status: 'aktif',
      },
      // Kelas 2A — 2 siswa
      {
        id: IDS.siswa4,
        tenantId: IDS.tenant,
        kelasId: IDS.kelas2A,
        nama: 'Putri Wati',
        nisn: '0012345004',
        jenisKelamin: 'P',
        tanggalLahir: '2016-05-30',
        alamat: 'Jl. Anggrek No. 8, Jakarta',
        orangTuaId: IDS.orangTua2,
        status: 'aktif',
      },
      {
        id: IDS.siswa5,
        tenantId: IDS.tenant,
        kelasId: IDS.kelas2A,
        nama: 'Rafi Hakim',
        nisn: '0012345005',
        jenisKelamin: 'L',
        tanggalLahir: '2016-11-02',
        alamat: 'Jl. Dahlia No. 3, Jakarta',
        orangTuaId: IDS.orangTua1,
        status: 'aktif',
      },
      // Kelas 3A — 2 siswa
      {
        id: IDS.siswa6,
        tenantId: IDS.tenant,
        kelasId: IDS.kelas3A,
        nama: 'Maya Sari',
        nisn: '0012345006',
        jenisKelamin: 'P',
        tanggalLahir: '2015-07-18',
        alamat: 'Jl. Mawar No. 20, Jakarta',
        orangTuaId: IDS.orangTua2,
        status: 'aktif',
      },
      {
        id: IDS.siswa7,
        tenantId: IDS.tenant,
        kelasId: IDS.kelas3A,
        nama: 'Rizki Pratama',
        nisn: '0012345007',
        jenisKelamin: 'L',
        tanggalLahir: '2015-12-25',
        alamat: 'Jl. Flamboyan No. 7, Jakarta',
        orangTuaId: IDS.orangTua1,
        status: 'aktif',
      },
    ]);

    // 7. Create default school configuration
    console.log('  → Creating konfigurasi sekolah...');
    await db.insert(konfigurasiSekolah).values([
      {
        tenantId: IDS.tenant,
        key: 'threshold_alpa',
        value: JSON.stringify({ value: 10, description: 'Batas alpa per bulan untuk peringatan' }),
      },
      {
        tenantId: IDS.tenant,
        key: 'nominal_spp',
        value: JSON.stringify({
          tingkat_1: 250000,
          tingkat_2: 275000,
          tingkat_3: 300000,
          tingkat_4: 325000,
          tingkat_5: 350000,
          tingkat_6: 375000,
        }),
      },
      {
        tenantId: IDS.tenant,
        key: 'tanggal_jatuh_tempo',
        value: JSON.stringify({ hari: 10, description: 'Tanggal jatuh tempo SPP setiap bulan' }),
      },
    ]);

    console.log('');
    console.log('✅ Seed completed successfully!');
    console.log('');
    console.log('📋 Summary:');
    console.log('   Tenant: Sekolah Contoh');
    console.log('   Users:');
    console.log('     - admin@sekolahcontoh.sch.id (admin)');
    console.log('     - kepsek@sekolahcontoh.sch.id (kepala_sekolah)');
    console.log('     - siti.rahayu@sekolahcontoh.sch.id (guru)');
    console.log('     - ahmad.wijaya@sekolahcontoh.sch.id (guru)');
    console.log('     - bendahara@sekolahcontoh.sch.id (bendahara)');
    console.log('     - 081234567890 (orang_tua - Hendra Gunawan)');
    console.log('     - 081298765432 (orang_tua - Rina Wati)');
    console.log('   Password for all staff: password123');
    console.log('   Tahun Ajaran: 2024/2025 (aktif)');
    console.log('   Kelas: 1A, 2A, 3A');
    console.log('   Siswa: 7 students across 3 classes');
    console.log('   Mata Pelajaran: MTK, BIND, IPA, IPS, BING');
    console.log('');
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
