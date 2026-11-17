-- =============================================================
-- Seed data lokal Teman Sekolah (khusus development)
-- Semua password staff: password123
-- =============================================================
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- Sekolah (tenant) ----------
INSERT INTO tenant (id, nama, alamat, telepon, email, jumlah_tingkat, hari_kerja)
VALUES ('11111111-0000-4000-8000-000000000001', 'SD Contoh Lokal', 'Jl. Belajar No. 1, Jakarta',
        '0211234567', 'info@sdcontoh.test', 6, '6_hari')
ON CONFLICT (id) DO NOTHING;

-- ---------- Tahun ajaran aktif ----------
INSERT INTO tahun_ajaran (id, tenant_id, nama, tanggal_mulai, tanggal_selesai,
                          semester_1_mulai, semester_1_selesai, semester_2_mulai, semester_2_selesai, status)
VALUES ('22222222-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001',
        '2026/2027', '2026-07-01', '2027-06-30',
        '2026-07-01', '2026-12-31', '2027-01-01', '2027-06-30', 'aktif')
ON CONFLICT (id) DO NOTHING;

-- ---------- User staff sekolah ----------
INSERT INTO "user" (id, tenant_id, nama, email, password_hash, role, is_active) VALUES
('33333333-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Admin Sekolah',        'admin@sdcontoh.test',     crypt('password123', gen_salt('bf', 10)), 'admin',          true),
('33333333-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Bapak Kepala Sekolah', 'kepsek@sdcontoh.test',    crypt('password123', gen_salt('bf', 10)), 'kepala_sekolah', true),
('33333333-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'Ibu Bendahara',        'bendahara@sdcontoh.test', crypt('password123', gen_salt('bf', 10)), 'bendahara',      true),
('33333333-0000-4000-8000-000000000011', '11111111-0000-4000-8000-000000000001', 'Siti Rahayu, S.Pd.',   'guru1@sdcontoh.test',     crypt('password123', gen_salt('bf', 10)), 'guru',           true),
('33333333-0000-4000-8000-000000000012', '11111111-0000-4000-8000-000000000001', 'Ahmad Wijaya, S.Pd.',  'guru2@sdcontoh.test',     crypt('password123', gen_salt('bf', 10)), 'guru',           true),
('33333333-0000-4000-8000-000000000013', '11111111-0000-4000-8000-000000000001', 'Ratna Dewi, S.Pd.',    'guru3@sdcontoh.test',     crypt('password123', gen_salt('bf', 10)), 'guru',           true)
ON CONFLICT (id) DO NOTHING;

-- ---------- Orang tua (login pakai nomor HP, tanpa tenant) ----------
INSERT INTO "user" (id, tenant_id, nama, phone, role, is_active) VALUES
('44444444-0000-4000-8000-000000000001', NULL, 'Budi Santoso',  '081200000001', 'orang_tua', true),
('44444444-0000-4000-8000-000000000002', NULL, 'Dewi Lestari',  '081200000002', 'orang_tua', true),
('44444444-0000-4000-8000-000000000003', NULL, 'Hendra Gunawan','081200000003', 'orang_tua', true)
ON CONFLICT (id) DO NOTHING;

-- ---------- Mata pelajaran ----------
INSERT INTO mata_pelajaran (id, tenant_id, nama, kode) VALUES
('55555555-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Matematika',       'MTK'),
('55555555-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Bahasa Indonesia', 'BIND'),
('55555555-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'IPA',              'IPA')
ON CONFLICT (id) DO NOTHING;

-- ---------- Kelas (wali kelas = guru 1, 2, 3) ----------
INSERT INTO kelas (id, tenant_id, tahun_ajaran_id, nama, tingkat, wali_kelas_id, kapasitas) VALUES
('66666666-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000001', '1A', 1, '33333333-0000-4000-8000-000000000011', 30),
('66666666-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000001', '2A', 2, '33333333-0000-4000-8000-000000000012', 30),
('66666666-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000001', '3A', 3, '33333333-0000-4000-8000-000000000013', 30)
ON CONFLICT (id) DO NOTHING;

-- ---------- Siswa: 5 per kelas (15 total) ----------
INSERT INTO siswa (id, tenant_id, kelas_id, nama, nisn, jenis_kelamin, tanggal_lahir, alamat, orang_tua_id, status)
SELECT
  ('77777777-0000-4000-8000-' || lpad((k.n * 100 + s.n)::text, 12, '0'))::uuid,
  '11111111-0000-4000-8000-000000000001',
  ('66666666-0000-4000-8000-00000000000' || k.n)::uuid,
  (ARRAY['Andi','Bunga','Citra','Dimas','Eka','Fajar','Gita','Hadi','Intan','Joko','Kiki','Lestari','Mira','Nanda','Oki'])[(k.n - 1) * 5 + s.n]
    || ' ' || (ARRAY['Pratama','Sari','Putra','Putri','Wijaya'])[s.n],
  lpad((3000000000 + k.n * 100 + s.n)::text, 10, '0'),
  (CASE WHEN s.n % 2 = 1 THEN 'L' ELSE 'P' END)::jenis_kelamin,
  make_date(2020 - k.n, s.n, 10),
  'Jl. Contoh No. ' || (k.n * 10 + s.n),
  CASE
    WHEN k.n = 1 AND s.n = 1 THEN '44444444-0000-4000-8000-000000000001'::uuid
    WHEN k.n = 3 AND s.n = 1 THEN '44444444-0000-4000-8000-000000000001'::uuid  -- Budi punya 2 anak
    WHEN k.n = 1 AND s.n = 2 THEN '44444444-0000-4000-8000-000000000002'::uuid
    WHEN k.n = 2 AND s.n = 1 THEN '44444444-0000-4000-8000-000000000003'::uuid
    ELSE NULL
  END,
  'aktif'
FROM generate_series(1, 3) AS k(n), generate_series(1, 5) AS s(n)
ON CONFLICT (id) DO NOTHING;

-- ---------- Riwayat kelas ----------
INSERT INTO riwayat_kelas (tenant_id, siswa_id, kelas_id, tahun_ajaran_id, tanggal_mulai)
SELECT s.tenant_id, s.id, s.kelas_id, '22222222-0000-4000-8000-000000000001', '2026-07-01'
FROM siswa s
WHERE s.tenant_id = '11111111-0000-4000-8000-000000000001'
  AND NOT EXISTS (SELECT 1 FROM riwayat_kelas r WHERE r.siswa_id = s.id);

-- ---------- Jadwal: Senin-Sabtu, jam ke 1-3, mapel & guru bergilir ----------
INSERT INTO jadwal_pelajaran (tenant_id, kelas_id, mata_pelajaran_id, guru_id, tahun_ajaran_id,
                              semester, hari, jam_ke, tanggal_mulai_berlaku, tanggal_selesai_berlaku)
SELECT
  '11111111-0000-4000-8000-000000000001',
  ('66666666-0000-4000-8000-00000000000' || k.n)::uuid,
  ('55555555-0000-4000-8000-00000000000' || (((k.n + j.n) % 3) + 1))::uuid,
  ('33333333-0000-4000-8000-00000000001' || (((k.n + j.n) % 3) + 1))::uuid,
  '22222222-0000-4000-8000-000000000001',
  1,
  h.hari,
  j.n,
  '2026-07-01',
  '2026-12-31'
FROM generate_series(1, 3) AS k(n),
     unnest(ARRAY['senin','selasa','rabu','kamis','jumat','sabtu']) AS h(hari),
     generate_series(1, 3) AS j(n)
WHERE NOT EXISTS (
  SELECT 1 FROM jadwal_pelajaran jp
  WHERE jp.tenant_id = '11111111-0000-4000-8000-000000000001'
);

COMMIT;

-- Ringkasan
SELECT role, count(*) AS jumlah FROM "user" GROUP BY role ORDER BY role;