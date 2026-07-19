/**
 * Development Re-seed Script
 *
 * Clears siswa, tagihan, jadwal, absensi, rapor data and re-seeds with:
 * - 15 guru (one wali kelas per class)
 * - 10 siswa per kelas (15 kelas × 10 = 150 siswa)
 * - Jadwal pelajaran for all kelas
 * - Riwayat kelas entries
 * - 30 orang tua (one per siswa, some shared)
 *
 * Usage: npx ts-node -r tsconfig-paths/register src/drizzle/reseed-dev.ts
 */

import { Client } from 'pg';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

const TENANT_ID = '00000000-0000-4000-a000-000000000001';
const TAHUN_AJARAN_ID = '82086377-0981-40f1-9fbc-8dda3490933f'; // 2026/2027 (aktif)
const TA_MULAI = '2026-07-01';
const TA_SELESAI = '2027-06-30';

// Existing kelas for 2026/2027
const KELAS = [
  { id: 'b0000000-0000-4000-a000-000000000101', nama: '1A', tingkat: 1 },
  { id: 'b0000000-0000-4000-a000-000000000102', nama: '1B', tingkat: 1 },
  { id: 'b0000000-0000-4000-a000-000000000103', nama: '1C', tingkat: 1 },
  { id: 'b0000000-0000-4000-a000-000000000104', nama: '1D', tingkat: 1 },
  { id: 'b0000000-0000-4000-a000-000000000105', nama: '1E', tingkat: 1 },
  { id: 'b0000000-0000-4000-a000-000000000201', nama: '2A', tingkat: 2 },
  { id: 'b0000000-0000-4000-a000-000000000202', nama: '2B', tingkat: 2 },
  { id: 'b0000000-0000-4000-a000-000000000203', nama: '2C', tingkat: 2 },
  { id: 'b0000000-0000-4000-a000-000000000204', nama: '2D', tingkat: 2 },
  { id: 'b0000000-0000-4000-a000-000000000205', nama: '2E', tingkat: 2 },
  { id: 'b0000000-0000-4000-a000-000000000301', nama: '3A', tingkat: 3 },
  { id: 'b0000000-0000-4000-a000-000000000302', nama: '3B', tingkat: 3 },
  { id: 'b0000000-0000-4000-a000-000000000303', nama: '3C', tingkat: 3 },
  { id: 'b0000000-0000-4000-a000-000000000304', nama: '3D', tingkat: 3 },
  { id: 'b0000000-0000-4000-a000-000000000305', nama: '3E', tingkat: 3 },
];

// Existing mapel
const MAPEL = [
  { id: '00000000-0000-4000-a000-000000000040', nama: 'Matematika', kode: 'MTK' },
  { id: '00000000-0000-4000-a000-000000000041', nama: 'Bahasa Indonesia', kode: 'BIND' },
  { id: '00000000-0000-4000-a000-000000000042', nama: 'IPA', kode: 'IPA' },
  { id: '00000000-0000-4000-a000-000000000043', nama: 'IPS', kode: 'IPS' },
  { id: '00000000-0000-4000-a000-000000000044', nama: 'Bahasa Inggris', kode: 'BING' },
];

// Existing guru IDs
const EXISTING_GURU = [
  '00000000-0000-4000-a000-000000000012', // Siti Rahayu
  '00000000-0000-4000-a000-000000000013', // Ahmad Wijaya
  '00000000-0000-4000-a000-000000000017', // Ratna Dewi
  '00000000-0000-4000-a000-000000000018', // Hasan Basri
  '00000000-0000-4000-a000-000000000019', // Yuliana Sari
];

// New guru to create (need 10 more for 15 total wali kelas)
const NEW_GURU = [
  {
    id: 'd0000000-0000-4000-a000-000000000001',
    nama: 'Rina Anggraini, S.Pd.',
    email: 'rina.anggraini@sekolahcontoh.sch.id',
  },
  {
    id: 'd0000000-0000-4000-a000-000000000002',
    nama: 'Teguh Prasetyo, S.Pd.',
    email: 'teguh.prasetyo@sekolahcontoh.sch.id',
  },
  {
    id: 'd0000000-0000-4000-a000-000000000003',
    nama: 'Lina Marlina, S.Pd.',
    email: 'lina.marlina@sekolahcontoh.sch.id',
  },
  {
    id: 'd0000000-0000-4000-a000-000000000004',
    nama: 'Dani Setiawan, S.Pd.',
    email: 'dani.setiawan@sekolahcontoh.sch.id',
  },
  {
    id: 'd0000000-0000-4000-a000-000000000005',
    nama: 'Wulan Handayani, S.Pd.',
    email: 'wulan.handayani@sekolahcontoh.sch.id',
  },
  {
    id: 'd0000000-0000-4000-a000-000000000006',
    nama: 'Agus Hermawan, S.Pd.',
    email: 'agus.hermawan@sekolahcontoh.sch.id',
  },
  {
    id: 'd0000000-0000-4000-a000-000000000007',
    nama: 'Nur Hasanah, S.Pd.',
    email: 'nur.hasanah@sekolahcontoh.sch.id',
  },
  {
    id: 'd0000000-0000-4000-a000-000000000008',
    nama: 'Bambang Susanto, S.Pd.',
    email: 'bambang.susanto@sekolahcontoh.sch.id',
  },
  {
    id: 'd0000000-0000-4000-a000-000000000009',
    nama: 'Kartika Dewi, S.Pd.',
    email: 'kartika.dewi@sekolahcontoh.sch.id',
  },
  {
    id: 'd0000000-0000-4000-a000-000000000010',
    nama: 'Farid Hidayat, S.Pd.',
    email: 'farid.hidayat@sekolahcontoh.sch.id',
  },
];

// All guru IDs (existing + new) — will be used as wali kelas
const ALL_GURU_IDS = [...EXISTING_GURU, ...NEW_GURU.map((g) => g.id)];

// Indonesian student names
const NAMA_LAKI = [
  'Andi Prasetyo',
  'Budi Santoso',
  'Cahyo Wibowo',
  'Dimas Aditya',
  'Eko Saputra',
  'Fajar Nugroho',
  'Galih Prakoso',
  'Hendra Kusuma',
  'Irfan Hakim',
  'Joko Susilo',
  'Kevin Ramadhan',
  'Luthfi Aziz',
  'Muhammad Rizki',
  'Naufal Hanif',
  'Oscar Pratama',
  'Putra Mahardika',
  'Reza Firmansyah',
  'Satria Wicaksono',
  'Taufik Hidayat',
  'Umar Faruq',
  'Vino Bastian',
  'Wahyu Setiadi',
  'Yusuf Maulana',
  'Zaki Mubarok',
  'Arif Rahman',
  'Bagas Purnomo',
  'Dafa Anugrah',
  'Evan Darmawan',
  'Farel Prayoga',
  'Gilang Ramadhan',
  'Hafiz Abdullah',
  'Ivan Gunawan',
  'Jihan Maulidy',
  'Kenzie Alvaro',
  'Lutfi Hakim',
  'Maulana Ibrahim',
  'Nabil Akbar',
  'Omar Bakri',
  'Pandu Wijaya',
  'Raffi Ahmad',
  'Seno Aji',
  'Tegar Pamungkas',
  'Ulil Albab',
  'Vega Aditama',
  'Wisnu Wardana',
  'Yoga Pratama',
  'Zainal Abidin',
  'Aldi Firmansyah',
  'Bima Sakti',
  'Candra Wijaya',
  'Diki Setiawan',
  'Erlangga Putra',
  'Fandi Ahmad',
  'Guntur Prabowo',
  'Helmi Azhari',
  'Iwan Setiawan',
  'Jefri Kurniawan',
  'Kamal Hasan',
  'Leo Messi',
  'Mahesa Putra',
  'Nanda Pratama',
  'Oka Antara',
  'Pras Teguh',
  'Rangga Moela',
  'Surya Saputra',
  'Toni Firmansyah',
  'Udin Saefudin',
  'Vigor Pratama',
  'Wawan Hermawan',
  'Yogi Setiawan',
  'Zulfan Aziz',
  'Abimanyu Putra',
  'Bayu Segara',
  'Chandra Hadi',
  'Dito Mahendra',
];

const NAMA_PEREMPUAN = [
  'Aisyah Putri',
  'Bunga Citra',
  'Cinta Ayu',
  'Dian Pertiwi',
  'Eka Safitri',
  'Fitri Rahayu',
  'Gita Nirmala',
  'Hana Pertiwi',
  'Indah Permata',
  'Julia Sari',
  'Kartika Sari',
  'Laras Wati',
  'Maya Anggraini',
  'Nisa Aulia',
  'Olivia Putri',
  'Putri Andriani',
  'Qonita Zahira',
  'Rani Kusuma',
  'Sinta Dewi',
  'Tari Lestari',
  'Umi Kalsum',
  'Vina Panduwinata',
  'Wulan Sari',
  'Xena Putri',
  'Yuni Shara',
  'Zahra Amelia',
  'Anisa Rahma',
  'Bella Safira',
  'Cantika Aurel',
  'Dinda Permata',
  'Elsa Pitaloka',
  'Fiona Gabriella',
  'Gisella Anastasia',
  'Halimah Atus',
  'Intan Nuraini',
  'Jasmine Putri',
  'Keisha Alvira',
  'Lala Karmela',
  'Maudy Ayunda',
  'Naura Ayu',
  'Ophelia Sari',
  'Prilly Latuconsina',
  'Quinsha Zahra',
  'Raisa Andriana',
  'Salma Hayek',
  'Tiara Andini',
  'Ulfa Dwiyanti',
  'Vanessa Angel',
  'Widya Mulia',
  'Yasmine Wildblood',
  'Zaskia Mecca',
  'Amira Hanun',
  'Bilqis Putri',
  'Calista Rini',
  'Dea Ananda',
  'Elvina Sari',
  'Farah Diba',
  'Gina Salsabila',
  'Hasna Azzahra',
  'Izma Callista',
  'Jelita Ayu',
  'Kinanti Putri',
  'Lintang Sari',
  'Marsya Gusman',
  'Nadine Waworuntu',
  'Ocha Sari',
  'Puspita Sari',
  'Raline Shah',
  'Shinta Rosari',
  'Tasya Kamila',
  'Ulfah Medina',
  'Vania Putri',
  'Windy Walters',
  'Ximena Putri',
  'Yolanda Sari',
];

const ALAMAT = [
  'Jl. Merdeka No.',
  'Jl. Sudirman No.',
  'Jl. Thamrin No.',
  'Jl. Gatot Subroto No.',
  'Jl. Ahmad Yani No.',
  'Jl. Diponegoro No.',
  'Jl. Imam Bonjol No.',
  'Jl. Veteran No.',
  'Jl. Pahlawan No.',
  'Jl. Kartini No.',
  'Jl. Hayam Wuruk No.',
  'Jl. Gajah Mada No.',
  'Jl. Asia Afrika No.',
  'Jl. Pemuda No.',
  'Jl. Antapani No.',
];

async function reseed() {
  const databaseUrl =
    process.env.DATABASE_URL ||
    'postgresql://postgres:YtdDchIKuzRtSCxNvLooKVwfMkaNtNHP@hayabusa.proxy.rlwy.net:30488/railway';
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  console.log('🗑️  Clearing existing data...');

  // Delete in dependency order
  await client.query('DELETE FROM rapor_nilai');
  await client.query('DELETE FROM rapor_nilai_audit');
  await client.query('DELETE FROM rapor');
  await client.query('DELETE FROM absensi_audit');
  await client.query('DELETE FROM absensi');
  await client.query('DELETE FROM tagihan_transaksi');
  await client.query('DELETE FROM tagihan');
  await client.query('DELETE FROM riwayat_kelas');
  await client.query('DELETE FROM jadwal_pelajaran');
  await client.query('DELETE FROM guru_pengganti');
  await client.query('DELETE FROM siswa');
  // Delete old orang_tua that start with c0000000 (from previous reseed)
  await client.query(`DELETE FROM "user" WHERE id::text LIKE 'c0000000%' AND role = 'orang_tua'`);

  console.log('✅ Data cleared');

  // Create new guru
  console.log('👨‍🏫 Creating new guru...');
  const passwordHash = await bcrypt.hash('password123', 10);

  for (const guru of NEW_GURU) {
    await client.query(
      `INSERT INTO "user" (id, tenant_id, nama, email, password_hash, role, is_active)
       VALUES ($1, $2, $3, $4, $5, 'guru', true)
       ON CONFLICT DO NOTHING`,
      [guru.id, TENANT_ID, guru.nama, guru.email, passwordHash],
    );
  }

  // Assign wali kelas
  console.log('🏫 Assigning wali kelas...');
  for (let i = 0; i < KELAS.length; i++) {
    await client.query(`UPDATE kelas SET wali_kelas_id = $1 WHERE id = $2`, [
      ALL_GURU_IDS[i],
      KELAS[i].id,
    ]);
  }

  // Create orang tua (30 parents for 150 siswa - each parent has ~5 children)
  console.log('👨‍👩‍👧 Creating orang tua...');
  const orangTuaIds: string[] = [];
  const orangTuaNames = [
    'Bambang Suryanto',
    'Siti Aminah',
    'Joko Prasetyo',
    'Nur Halimah',
    'Agus Setiawan',
    'Ratih Kusuma',
    'Dedi Mulyadi',
    'Wulan Sari',
    'Tono Harjanto',
    'Melati Putri',
    'Surya Darma',
    'Endang Susilowati',
    'Wahyu Hidayat',
    'Ika Nurjanah',
    'Rudi Hartono',
    'Yanti Susanti',
    'Firman Syah',
    'Dewi Anggraini',
    'Budi Prasetyo',
    'Sri Wahyuni',
    'Eko Purwanto',
    'Lestari Handayani',
    'Arif Rahman',
    'Nurul Aini',
    'Hadi Santoso',
    'Fitri Rahmawati',
    'Gunawan Wibowo',
    'Ani Yulianti',
    'Sigit Purnomo',
    'Kartini Wulandari',
  ];

  for (let i = 0; i < 30; i++) {
    const id = `e0000000-0000-4000-a000-${String(i + 1).padStart(12, '0')}`;
    orangTuaIds.push(id);
    await client.query(
      `INSERT INTO "user" (id, tenant_id, nama, phone, role, is_active)
       VALUES ($1, NULL, $2, $3, 'orang_tua', true)
       ON CONFLICT DO NOTHING`,
      [id, orangTuaNames[i], `08130000${String(i + 1).padStart(4, '0')}`],
    );
  }

  // Create siswa (10 per kelas = 150 total)
  console.log('👦 Creating 150 siswa...');
  let maleIdx = 0;
  let femaleIdx = 0;
  let siswaNum = 0;
  const allSiswaIds: { id: string; kelasId: string }[] = [];

  for (const kls of KELAS) {
    for (let i = 0; i < 10; i++) {
      siswaNum++;
      const isMale = i < 5; // 5 boys, 5 girls per class
      const nama = isMale ? NAMA_LAKI[maleIdx++] : NAMA_PEREMPUAN[femaleIdx++];
      const jk = isMale ? 'L' : 'P';
      const id = `f0000000-0000-4000-a000-${String(siswaNum).padStart(12, '0')}`;
      const nisn = `00${String(2024000 + siswaNum).padStart(8, '0')}`;
      // Birth year based on tingkat: tingkat 1 = 2019, tingkat 2 = 2018, tingkat 3 = 2017
      const birthYear = 2020 - kls.tingkat;
      const birthMonth = String(((siswaNum * 3) % 12) + 1).padStart(2, '0');
      const birthDay = String(((siswaNum * 7) % 28) + 1).padStart(2, '0');
      const alamat = `${ALAMAT[siswaNum % ALAMAT.length]} ${siswaNum}, Jakarta`;
      // Assign parent: each parent gets ~5 children
      const orangTuaId = orangTuaIds[Math.floor((siswaNum - 1) / 5)];

      allSiswaIds.push({ id, kelasId: kls.id });

      await client.query(
        `INSERT INTO siswa (id, tenant_id, kelas_id, nama, nisn, jenis_kelamin, tanggal_lahir, alamat, orang_tua_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'aktif')`,
        [
          id,
          TENANT_ID,
          kls.id,
          nama,
          nisn,
          jk,
          `${birthYear}-${birthMonth}-${birthDay}`,
          alamat,
          orangTuaId,
        ],
      );
    }
  }

  // Create riwayat_kelas for all siswa
  console.log('📚 Creating riwayat kelas...');
  for (const s of allSiswaIds) {
    await client.query(
      `INSERT INTO riwayat_kelas (id, tenant_id, siswa_id, kelas_id, tahun_ajaran_id, tanggal_mulai)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [randomUUID(), TENANT_ID, s.id, s.kelasId, TAHUN_AJARAN_ID, TA_MULAI],
    );
  }

  // Create jadwal pelajaran for ALL kelas
  console.log('📅 Creating jadwal pelajaran...');
  const HARI = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
  const SLOTS = [
    { mulai: '07:30', selesai: '08:10' },
    { mulai: '08:10', selesai: '08:50' },
    { mulai: '08:50', selesai: '09:30' },
    // istirahat 09:30-09:45
    { mulai: '09:45', selesai: '10:25' },
    { mulai: '10:25', selesai: '11:05' },
    { mulai: '11:05', selesai: '11:45' },
  ];

  // Each kelas gets a rotating schedule of mapel with different guru
  // guru assignment per mapel per kelas: rotate through all guru
  for (let kelasIdx = 0; kelasIdx < KELAS.length; kelasIdx++) {
    const kls = KELAS[kelasIdx];

    for (let hariIdx = 0; hariIdx < HARI.length; hariIdx++) {
      const hari = HARI[hariIdx];

      for (let slotIdx = 0; slotIdx < SLOTS.length; slotIdx++) {
        const slot = SLOTS[slotIdx];
        // Rotate mapel: different each day/slot combo
        const mapelIdx = (hariIdx * SLOTS.length + slotIdx) % MAPEL.length;
        const mapel = MAPEL[mapelIdx];
        // Assign guru: rotate based on kelas and mapel to avoid conflicts
        // Each mapel gets a specific guru rotation
        const guruIdx = (mapelIdx * 3 + kelasIdx) % ALL_GURU_IDS.length;
        const guruId = ALL_GURU_IDS[guruIdx];

        await client.query(
          `INSERT INTO jadwal_pelajaran (id, tenant_id, kelas_id, mata_pelajaran_id, guru_id, tahun_ajaran_id, semester, hari, jam_mulai, jam_selesai, tanggal_mulai_berlaku, tanggal_selesai_berlaku)
           VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8, $9, $10, $11)`,
          [
            randomUUID(),
            TENANT_ID,
            kls.id,
            mapel.id,
            guruId,
            TAHUN_AJARAN_ID,
            hari,
            slot.mulai,
            slot.selesai,
            TA_MULAI,
            TA_SELESAI,
          ],
        );
      }
    }
  }

  console.log('');
  console.log('✅ Re-seed completed!');
  console.log('');
  console.log('📋 Summary:');
  console.log(`   Guru: ${ALL_GURU_IDS.length} (5 existing + 10 new)`);
  console.log(`   Orang Tua: 30`);
  console.log(`   Siswa: 150 (10 per kelas × 15 kelas)`);
  console.log(`   Riwayat Kelas: 150 entries`);
  console.log(
    `   Jadwal: ${KELAS.length * HARI.length * SLOTS.length} entries (${KELAS.length} kelas × 6 hari × 6 slot)`,
  );
  console.log('');
  console.log('   Wali Kelas assignment:');
  for (let i = 0; i < KELAS.length; i++) {
    const guruName =
      i < 5
        ? ['Siti Rahayu', 'Ahmad Wijaya', 'Ratna Dewi', 'Hasan Basri', 'Yuliana Sari'][i]
        : NEW_GURU[i - 5].nama;
    console.log(`     ${KELAS[i].nama} → ${guruName}`);
  }
  console.log('');
  console.log('   All guru password: password123');

  await client.end();
}

reseed().catch((e) => {
  console.error('❌ Reseed failed:', e);
  process.exit(1);
});
