/**
 * Tambah / perbarui akun staf sekolah (admin, guru, kepala_sekolah, bendahara) di database.
 * Dijalankan di dalam container edu-api (lihat railway-env/vps/tambah-admin.ps1):
 *   ADMIN_EMAIL=.. ADMIN_PASSWORD=.. [ADMIN_NAMA=..] [ADMIN_SEKOLAH=..] [ADMIN_ROLE=guru] node apps/api/tambah-admin.mjs
 *
 * - Email sudah ada → role diganti sesuai ADMIN_ROLE (default admin), password diganti, akun diaktifkan & dibuka kuncinya.
 * - Email belum ada → dibuat baru di sekolah (tenant). Kalau sekolah lebih dari satu,
 *   ADMIN_SEKOLAH wajib diisi (sebagian nama sekolah).
 * Password tidak disimpan di file mana pun.
 */
import pg from 'pg';
import bcrypt from 'bcrypt';

const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || '';
const namaInput = (process.env.ADMIN_NAMA || '').trim();
const sekolah = (process.env.ADMIN_SEKOLAH || '').trim();
const role = (process.env.ADMIN_ROLE || 'admin').trim().toLowerCase();
const ROLES = ['admin', 'guru', 'kepala_sekolah', 'bendahara'];
const LABEL = { admin: 'Admin', guru: 'Guru', kepala_sekolah: 'Kepala Sekolah', bendahara: 'Bendahara' };

if (!ROLES.includes(role)) {
  console.error(`❌ ADMIN_ROLE harus salah satu: ${ROLES.join(', ')}`);
  process.exit(1);
}

if (!email || !email.includes('@')) {
  console.error('❌ ADMIN_EMAIL belum diisi / tidak valid');
  process.exit(1);
}
if (password.length < 6) {
  console.error('❌ ADMIN_PASSWORD minimal 6 karakter');
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const hash = await bcrypt.hash(password, 10);

  const existing = await client.query(
    'SELECT id, tenant_id, role FROM "user" WHERE lower(email) = $1',
    [email],
  );

  if (existing.rows.length > 1) {
    console.error(`❌ Email ${email} terdaftar ${existing.rows.length}x, perbaiki manual dulu.`);
    process.exit(1);
  }

  if (existing.rows.length === 1) {
    const row = existing.rows[0];
    await client.query(
      `UPDATE "user"
          SET email = $3, role = $4, password_hash = $1, is_active = true,
              must_change_password = false, failed_login_attempts = 0,
              locked_until = NULL, updated_at = now()
        WHERE id = $2`,
      [hash, row.id, email, role],
    );
    if (!row.tenant_id) {
      console.warn('⚠️  Akun ini tidak terhubung ke sekolah mana pun (tenant kosong).');
    }
    if (row.role !== role) console.warn(`⚠️  Role lama "${row.role}" diganti jadi "${role}".`);
    console.log(`✅ Akun ${email} sudah ada → role ${role}, password diganti.`);
  } else {
    const tenants = await client.query(
      'SELECT id, nama FROM tenant WHERE is_active = true ORDER BY nama',
    );
    let pilihan = tenants.rows;
    if (sekolah) {
      pilihan = pilihan.filter((t) => t.nama.toLowerCase().includes(sekolah.toLowerCase()));
    }
    if (pilihan.length !== 1) {
      console.error(
        pilihan.length === 0
          ? '❌ Sekolah tidak ditemukan.'
          : '❌ Ada beberapa sekolah, isi ADMIN_SEKOLAH dengan salah satu nama ini:',
      );
      for (const t of tenants.rows) console.error(`   - ${t.nama}`);
      process.exit(1);
    }
    const tenant = pilihan[0];
    await client.query(
      `INSERT INTO "user" (tenant_id, nama, email, password_hash, role, is_active, must_change_password)
       VALUES ($1, $2, $3, $4, $5, true, false)`,
      [tenant.id, namaInput || `${LABEL[role]} Sekolah`, email, hash, role],
    );
    console.log(`✅ Akun ${LABEL[role]} ${email} dibuat untuk sekolah "${tenant.nama}".`);
  }
} finally {
  await client.end();
}
