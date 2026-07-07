-- =============================================================================
-- Row-Level Security (RLS) Policies for Multi-Tenant Isolation
-- Per ADR-001: PostgreSQL RLS as defense-in-depth for tenant isolation
-- =============================================================================
--
-- PREREQUISITES:
--   - Database roles created via setup-db-roles.sql:
--     * edu_migration (BYPASSRLS) — runs this script and all DDL migrations
--     * edu_app (NOBYPASSRLS) — runtime application role, RLS enforced
--
-- RUNTIME:
--   - TenantInterceptor sets: SET LOCAL app.tenant_id = '<uuid>'
--   - For orang_tua cross-tenant: SET LOCAL app.tenant_ids = '<uuid1>,<uuid2>'
--
-- EXCLUDED TABLES (no tenant_id column):
--   - tenant: cross-tenant auth lookup
--   - user: cross-tenant auth + parent model (tenant_id nullable)
--   - device_token: linked by user_id
--   - rpp_favorit: linked by guru_id
--   - absensi_audit: linked by absensi_id (inherits isolation from absensi)
--   - notifikasi_preferensi: linked by user_id + siswa_id
-- =============================================================================

-- ─── Enable RLS on all tenant-scoped tables ─────────────────────────────────

ALTER TABLE siswa ENABLE ROW LEVEL SECURITY;
ALTER TABLE absensi ENABLE ROW LEVEL SECURITY;
ALTER TABLE tagihan ENABLE ROW LEVEL SECURITY;
ALTER TABLE tagihan_transaksi ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_trail ENABLE ROW LEVEL SECURITY;
ALTER TABLE kelas ENABLE ROW LEVEL SECURITY;
ALTER TABLE tahun_ajaran ENABLE ROW LEVEL SECURITY;
ALTER TABLE mata_pelajaran ENABLE ROW LEVEL SECURITY;
ALTER TABLE jadwal_pelajaran ENABLE ROW LEVEL SECURITY;
ALTER TABLE guru_pengganti ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifikasi ENABLE ROW LEVEL SECURITY;
ALTER TABLE komponen_penilaian ENABLE ROW LEVEL SECURITY;
ALTER TABLE rapor ENABLE ROW LEVEL SECURITY;
ALTER TABLE rapor_nilai ENABLE ROW LEVEL SECURITY;
ALTER TABLE kategori_rpp ENABLE ROW LEVEL SECURITY;
ALTER TABLE rpp ENABLE ROW LEVEL SECURITY;
ALTER TABLE konfigurasi_sekolah ENABLE ROW LEVEL SECURITY;
ALTER TABLE hari_libur ENABLE ROW LEVEL SECURITY;
ALTER TABLE riwayat_kelas ENABLE ROW LEVEL SECURITY;

-- ─── Force RLS on table owners ──────────────────────────────────────────────
-- By default, table owners bypass RLS. FORCE ensures even the owner role
-- is subject to policies (belt-and-suspenders with NOBYPASSRLS on edu_app).

ALTER TABLE siswa FORCE ROW LEVEL SECURITY;
ALTER TABLE absensi FORCE ROW LEVEL SECURITY;
ALTER TABLE tagihan FORCE ROW LEVEL SECURITY;
ALTER TABLE tagihan_transaksi FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_trail FORCE ROW LEVEL SECURITY;
ALTER TABLE kelas FORCE ROW LEVEL SECURITY;
ALTER TABLE tahun_ajaran FORCE ROW LEVEL SECURITY;
ALTER TABLE mata_pelajaran FORCE ROW LEVEL SECURITY;
ALTER TABLE jadwal_pelajaran FORCE ROW LEVEL SECURITY;
ALTER TABLE guru_pengganti FORCE ROW LEVEL SECURITY;
ALTER TABLE notifikasi FORCE ROW LEVEL SECURITY;
ALTER TABLE komponen_penilaian FORCE ROW LEVEL SECURITY;
ALTER TABLE rapor FORCE ROW LEVEL SECURITY;
ALTER TABLE rapor_nilai FORCE ROW LEVEL SECURITY;
ALTER TABLE kategori_rpp FORCE ROW LEVEL SECURITY;
ALTER TABLE rpp FORCE ROW LEVEL SECURITY;
ALTER TABLE konfigurasi_sekolah FORCE ROW LEVEL SECURITY;
ALTER TABLE hari_libur FORCE ROW LEVEL SECURITY;
ALTER TABLE riwayat_kelas FORCE ROW LEVEL SECURITY;

-- ─── Tenant Isolation Policies ──────────────────────────────────────────────
-- Standard single-tenant isolation for staff sessions.
-- Matches: tenant_id = current_setting('app.tenant_id')::uuid
-- Applies to ALL operations (SELECT, INSERT, UPDATE, DELETE).

CREATE POLICY tenant_isolation ON siswa
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE POLICY tenant_isolation ON absensi
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE POLICY tenant_isolation ON tagihan
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE POLICY tenant_isolation ON tagihan_transaksi
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE POLICY tenant_isolation ON audit_trail
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE POLICY tenant_isolation ON kelas
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE POLICY tenant_isolation ON tahun_ajaran
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE POLICY tenant_isolation ON mata_pelajaran
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE POLICY tenant_isolation ON jadwal_pelajaran
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE POLICY tenant_isolation ON guru_pengganti
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE POLICY tenant_isolation ON notifikasi
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE POLICY tenant_isolation ON komponen_penilaian
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE POLICY tenant_isolation ON rapor
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE POLICY tenant_isolation ON rapor_nilai
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE POLICY tenant_isolation ON kategori_rpp
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE POLICY tenant_isolation ON rpp
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE POLICY tenant_isolation ON konfigurasi_sekolah
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE POLICY tenant_isolation ON hari_libur
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE POLICY tenant_isolation ON riwayat_kelas
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

-- ─── Cross-Tenant Parent Policies ───────────────────────────────────────────
-- Parents (orang_tua) can have children in multiple schools (tenants).
-- Their session sets: SET LOCAL app.tenant_ids = 'uuid1,uuid2,...'
-- These SELECT-only policies allow cross-tenant read access on relevant tables.

CREATE POLICY parent_cross_tenant ON siswa
  FOR SELECT
  USING (tenant_id = ANY(string_to_array(current_setting('app.tenant_ids', true), ',')::uuid[]));

CREATE POLICY parent_cross_tenant ON absensi
  FOR SELECT
  USING (tenant_id = ANY(string_to_array(current_setting('app.tenant_ids', true), ',')::uuid[]));

CREATE POLICY parent_cross_tenant ON tagihan
  FOR SELECT
  USING (tenant_id = ANY(string_to_array(current_setting('app.tenant_ids', true), ',')::uuid[]));

CREATE POLICY parent_cross_tenant ON tagihan_transaksi
  FOR SELECT
  USING (tenant_id = ANY(string_to_array(current_setting('app.tenant_ids', true), ',')::uuid[]));

CREATE POLICY parent_cross_tenant ON notifikasi
  FOR SELECT
  USING (tenant_id = ANY(string_to_array(current_setting('app.tenant_ids', true), ',')::uuid[]));

CREATE POLICY parent_cross_tenant ON rapor_nilai
  FOR SELECT
  USING (tenant_id = ANY(string_to_array(current_setting('app.tenant_ids', true), ',')::uuid[]));

-- ─── Notes ──────────────────────────────────────────────────────────────────
--
-- 1. edu_migration role (BYPASSRLS) is unaffected by these policies.
--    It can freely run DDL, migrations, and seed scripts.
--
-- 2. edu_app role (NOBYPASSRLS) must always SET LOCAL app.tenant_id before queries.
--    Without it, the current_setting() call will raise an error (no default),
--    which is intentional — fail-closed rather than fail-open.
--
-- 3. current_setting('app.tenant_ids', true) uses the `missing_ok` parameter.
--    If app.tenant_ids is not set (non-parent sessions), it returns NULL,
--    and the ANY(...) expression evaluates to FALSE — no rows match.
--    This means the parent policy is a no-op for staff sessions.
--
-- 4. The tenant_isolation policy does NOT use missing_ok because we WANT
--    staff queries to fail loudly if app.tenant_id is not set. This catches
--    bugs where the TenantInterceptor fails to set the session variable.
--
-- 5. FORCE ROW LEVEL SECURITY ensures policies apply even if the connected
--    role owns the tables. Combined with NOBYPASSRLS, this provides two
--    independent safety layers.
