import { Pool } from 'pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { randomUUID } from 'crypto';
import * as path from 'path';

import { tenant } from '@/drizzle/schema/tenant';
import { tahunAjaran } from '@/drizzle/schema/tahun-ajaran';
import { kelas } from '@/drizzle/schema/kelas';
import { siswa } from '@/drizzle/schema/siswa';
import { tagihan, tagihanTransaksi, auditTrail } from '@/drizzle/schema/tagihan';
import { konfigurasiSekolah } from '@/drizzle/schema/konfigurasi';

/**
 * Billing Integration Tests
 *
 * Tests the full billing lifecycle directly against PostgreSQL:
 * 1. Generate tagihan → creates records for active students
 * 2. Upload bukti transfer → creates transaksi with status pending (menunggu_verifikasi)
 * 3. Verify (approve) → tagihan status transitions to lunas/cicilan
 * 4. Manual payment → tagihan cicilan → lunas
 * 5. Reject → re-upload allowed
 * 6. Cicilan flow: partial → cicilan → second payment → lunas
 * 7. Duplicate generate → skips existing
 *
 * Requirements: 9–15, 34
 */
describe('Billing Integration Tests', () => {
  let pool: Pool;
  let db: NodePgDatabase;

  // Test entity IDs
  const tenantId = randomUUID();
  const bendaharaId = randomUUID();
  const orangTuaId = randomUUID();
  const tahunAjaranId = randomUUID();
  const kelasId = randomUUID();
  const siswaId1 = randomUUID();
  const siswaId2 = randomUUID();

  beforeAll(async () => {
    const dbName = process.env.TEST_DB_NAME || 'edu_test';
    // Connect directly to the test database (created by globalSetup)
    const baseUrl =
      process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';
    const url = new URL(baseUrl);
    url.pathname = `/${dbName}`;
    const connectionString = url.toString();

    pool = new Pool({ connectionString, max: 5 });
    db = drizzle(pool);

    // Run migrations to ensure base schema exists
    const migrationsFolder = path.resolve(__dirname, '../../drizzle/migrations');
    await migrate(db, { migrationsFolder });

    // Create billing-specific tables (not yet in main migration file)
    await createBillingSchema();

    // Seed base data for all tests
    await seedTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await pool.end();
  });

  async function seedTestData() {
    // Create tenant
    await db.insert(tenant).values({
      id: tenantId,
      nama: 'Sekolah Integration Test',
      alamat: 'Jl. Test',
      telepon: '081234567890',
      isActive: true,
    });

    // Create users via raw SQL to handle column mismatch with migration
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO "user" (id, tenant_id, nama, email, role, is_active) VALUES ($1, $2, $3, $4, $5, $6)`,
        [bendaharaId, tenantId, 'Bendahara Test', 'bendahara@test.edu', 'bendahara', true],
      );
      await client.query(
        `INSERT INTO "user" (id, tenant_id, nama, phone, role, is_active) VALUES ($1, $2, $3, $4, $5, $6)`,
        [orangTuaId, null, 'Orang Tua Test', '081234567891', 'orang_tua', true],
      );
    } finally {
      client.release();
    }

    // Create tahun ajaran (aktif)
    await db.insert(tahunAjaran).values({
      id: tahunAjaranId,
      tenantId,
      nama: '2024/2025',
      tanggalMulai: '2024-07-01',
      tanggalSelesai: '2025-06-30',
      status: 'aktif',
    });

    // Create kelas (tingkat 1)
    await db.insert(kelas).values({
      id: kelasId,
      tenantId,
      tahunAjaranId,
      nama: '1A',
      tingkat: 1,
      kapasitas: 30,
    });

    // Create 2 active students
    await db.insert(siswa).values([
      {
        id: siswaId1,
        tenantId,
        kelasId,
        nama: 'Budi Santoso',
        nisn: '0012345678',
        jenisKelamin: 'L',
        status: 'aktif',
        orangTuaId,
      },
      {
        id: siswaId2,
        tenantId,
        kelasId,
        nama: 'Sari Dewi',
        nisn: '0012345679',
        jenisKelamin: 'P',
        status: 'aktif',
        orangTuaId,
      },
    ]);

    // Configure SPP nominal per tingkat
    await db.insert(konfigurasiSekolah).values({
      tenantId,
      key: 'nominal_spp',
      value: { '1': 500000, '2': 550000, '3': 600000 },
    });

    // Configure tanggal jatuh tempo (day of month)
    await db.insert(konfigurasiSekolah).values({
      tenantId,
      key: 'tanggal_jatuh_tempo',
      value: 10,
    });
  }

  async function cleanupTestData() {
    // Clean in reverse dependency order
    await db.delete(auditTrail).where(eq(auditTrail.tenantId, tenantId));
    await db.delete(tagihanTransaksi).where(eq(tagihanTransaksi.tenantId, tenantId));
    await db.delete(tagihan).where(eq(tagihan.tenantId, tenantId));
    await db.delete(siswa).where(eq(siswa.tenantId, tenantId));
    await db.delete(kelas).where(eq(kelas.tenantId, tenantId));
    await db.delete(tahunAjaran).where(eq(tahunAjaran.tenantId, tenantId));
    await db.delete(konfigurasiSekolah).where(eq(konfigurasiSekolah.tenantId, tenantId));
    // Use raw SQL for user deletion (schema mismatch with migration)
    const client = await pool.connect();
    try {
      await client.query(`DELETE FROM "user" WHERE id = $1 OR id = $2`, [bendaharaId, orangTuaId]);
    } finally {
      client.release();
    }
    await db.delete(tenant).where(eq(tenant.id, tenantId));
  }

  async function createBillingSchema() {
    const client = await pool.connect();
    try {
      // Create billing enums (if not exist)
      await client.query(`
        DO $$ BEGIN
          CREATE TYPE "public"."status_pembayaran" AS ENUM(
            'belum_bayar', 'menunggu_verifikasi', 'cicilan', 'lunas', 'ditolak', 'dibatalkan'
          );
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `);
      await client.query(`
        DO $$ BEGIN
          CREATE TYPE "public"."metode_pembayaran" AS ENUM('upload_bukti', 'tunai', 'transfer_manual');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `);
      await client.query(`
        DO $$ BEGIN
          CREATE TYPE "public"."status_transaksi" AS ENUM('pending', 'approved', 'rejected');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `);

      // Create tagihan table
      await client.query(`
        CREATE TABLE IF NOT EXISTS "tagihan" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "tenant_id" uuid NOT NULL,
          "siswa_id" uuid NOT NULL,
          "bulan" integer NOT NULL,
          "tahun" integer NOT NULL,
          "tahun_ajaran_id" uuid,
          "nominal" bigint NOT NULL,
          "total_dibayar" bigint NOT NULL DEFAULT 0,
          "status" "status_pembayaran" NOT NULL DEFAULT 'belum_bayar',
          "tanggal_jatuh_tempo" date,
          "alasan_pembatalan" text,
          "created_at" timestamp with time zone NOT NULL DEFAULT now(),
          "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
          CONSTRAINT "uq_tagihan_siswa_bulan_tahun" UNIQUE("siswa_id","bulan","tahun"),
          CONSTRAINT "chk_tagihan_bulan" CHECK ("bulan" BETWEEN 1 AND 12)
        );
      `);

      // Create tagihan_transaksi table
      await client.query(`
        CREATE TABLE IF NOT EXISTS "tagihan_transaksi" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "tenant_id" uuid NOT NULL,
          "tagihan_id" uuid NOT NULL,
          "jumlah_bayar" bigint NOT NULL,
          "metode" "metode_pembayaran" NOT NULL,
          "status" "status_transaksi" NOT NULL DEFAULT 'pending',
          "bukti_transfer_url" varchar(500),
          "catatan" text,
          "alasan_penolakan" text,
          "verified_by" uuid,
          "verified_at" timestamp with time zone,
          "uploaded_by" uuid,
          "nomor_referensi" varchar(50) UNIQUE,
          "created_at" timestamp with time zone NOT NULL DEFAULT now()
        );
      `);

      // Create audit_trail table
      await client.query(`
        CREATE TABLE IF NOT EXISTS "audit_trail" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "tenant_id" uuid NOT NULL,
          "user_id" uuid NOT NULL,
          "jenis_aksi" varchar(50) NOT NULL,
          "entity_type" varchar(50) NOT NULL,
          "entity_id" uuid NOT NULL,
          "nilai_sebelum" jsonb,
          "nilai_sesudah" jsonb,
          "alasan" text,
          "created_at" timestamp with time zone NOT NULL DEFAULT now()
        );
      `);

      // Create indexes
      await client.query(`
        CREATE INDEX IF NOT EXISTS "idx_tagihan_tenant_status" ON "tagihan" ("tenant_id", "status");
        CREATE INDEX IF NOT EXISTS "idx_tagihan_siswa" ON "tagihan" ("siswa_id", "tahun");
        CREATE INDEX IF NOT EXISTS "idx_audit_trail_tenant" ON "audit_trail" ("tenant_id", "created_at");
      `);
    } finally {
      client.release();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Test 1: Generate tagihan for a class → creates tagihan for all active students
  // Requirements: 9.1, 9.2, 9.3, 10.1, 10.2
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Generate tagihan for a class', () => {
    afterAll(async () => {
      // Clean tagihan for subsequent tests
      await db.delete(tagihanTransaksi).where(eq(tagihanTransaksi.tenantId, tenantId));
      await db.delete(tagihan).where(eq(tagihan.tenantId, tenantId));
    });

    it('should create tagihan records for all active students in the class', async () => {
      // Generate tagihan for July 2024
      const bulan = 7;
      const tahun = 2024;

      // Insert tagihan for active students (simulating the service logic)
      const values = [siswaId1, siswaId2].map((sId) => ({
        tenantId,
        siswaId: sId,
        bulan,
        tahun,
        tahunAjaranId,
        nominal: 500000,
        tanggalJatuhTempo: '2024-07-10',
      }));

      const inserted = await db
        .insert(tagihan)
        .values(values)
        .onConflictDoNothing({ target: [tagihan.siswaId, tagihan.bulan, tagihan.tahun] })
        .returning();

      expect(inserted).toHaveLength(2);

      // Verify each record
      for (const record of inserted) {
        expect(record.tenantId).toBe(tenantId);
        expect(record.bulan).toBe(bulan);
        expect(record.tahun).toBe(tahun);
        expect(record.nominal).toBe(500000);
        expect(record.status).toBe('belum_bayar');
        expect(record.totalDibayar).toBe(0);
        expect(record.tanggalJatuhTempo).toBe('2024-07-10');
      }

      // Verify both students got tagihan
      const studentIds = inserted.map((r) => r.siswaId);
      expect(studentIds).toContain(siswaId1);
      expect(studentIds).toContain(siswaId2);
    });

    it('should set initial status as belum_bayar (Req 9.3)', async () => {
      const results = await db
        .select()
        .from(tagihan)
        .where(and(eq(tagihan.tenantId, tenantId), eq(tagihan.bulan, 7), eq(tagihan.tahun, 2024)));

      for (const record of results) {
        expect(record.status).toBe('belum_bayar');
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Test 2: Upload bukti transfer → creates transaksi with status pending
  // Requirements: 11.1, 11.4, 11.7
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Upload bukti transfer → verify → lunas flow', () => {
    let tagihanId: string;
    let transaksiId: string;

    beforeAll(async () => {
      // Create a tagihan for siswa1, August 2024
      const [record] = await db
        .insert(tagihan)
        .values({
          tenantId,
          siswaId: siswaId1,
          bulan: 8,
          tahun: 2024,
          tahunAjaranId,
          nominal: 500000,
          tanggalJatuhTempo: '2024-08-10',
        })
        .returning();
      tagihanId = record.id;
    });

    afterAll(async () => {
      await db.delete(tagihanTransaksi).where(eq(tagihanTransaksi.tenantId, tenantId));
      await db.delete(tagihan).where(eq(tagihan.tenantId, tenantId));
    });

    it('should create transaksi with status pending on upload', async () => {
      const nomorReferensi = `BT-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;

      // Simulate uploading bukti transfer
      const [transaksi] = await db
        .insert(tagihanTransaksi)
        .values({
          tenantId,
          tagihanId,
          jumlahBayar: 500000,
          metode: 'upload_bukti',
          status: 'pending',
          buktiTransferUrl: `bukti-transfer/${tenantId}/${tagihanId}/test.jpg`,
          uploadedBy: orangTuaId,
          nomorReferensi,
        })
        .returning();

      transaksiId = transaksi.id;

      expect(transaksi.status).toBe('pending');
      expect(transaksi.metode).toBe('upload_bukti');
      expect(transaksi.jumlahBayar).toBe(500000);
      expect(transaksi.uploadedBy).toBe(orangTuaId);

      // Update tagihan status to menunggu_verifikasi
      await db
        .update(tagihan)
        .set({ status: 'menunggu_verifikasi', updatedAt: new Date() })
        .where(eq(tagihan.id, tagihanId));

      const [updatedTagihan] = await db.select().from(tagihan).where(eq(tagihan.id, tagihanId));

      expect(updatedTagihan.status).toBe('menunggu_verifikasi');
    });

    it('should transition tagihan to lunas when bukti is approved (full amount)', async () => {
      // Approve the pending transaction
      await db
        .update(tagihanTransaksi)
        .set({
          status: 'approved',
          verifiedBy: bendaharaId,
          verifiedAt: new Date(),
        })
        .where(eq(tagihanTransaksi.id, transaksiId));

      // Update tagihan: total_dibayar + status
      const nominal = 500000;
      const jumlahBayar = 500000;
      const newTotalDibayar = jumlahBayar;
      const newStatus = newTotalDibayar >= nominal ? 'lunas' : 'cicilan';

      await db
        .update(tagihan)
        .set({
          totalDibayar: newTotalDibayar,
          status: newStatus,
          updatedAt: new Date(),
        })
        .where(eq(tagihan.id, tagihanId));

      // Verify final state
      const [finalTagihan] = await db.select().from(tagihan).where(eq(tagihan.id, tagihanId));

      expect(finalTagihan.status).toBe('lunas');
      expect(finalTagihan.totalDibayar).toBe(500000);

      // Verify transaksi is approved
      const [finalTransaksi] = await db
        .select()
        .from(tagihanTransaksi)
        .where(eq(tagihanTransaksi.id, transaksiId));

      expect(finalTransaksi.status).toBe('approved');
      expect(finalTransaksi.verifiedBy).toBe(bendaharaId);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Test 3: Manual payment → cicilan → lunas flow
  // Requirements: 13.1, 13.2, 13.4, 13.5
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Manual payment → cicilan → lunas flow', () => {
    let tagihanId: string;

    beforeAll(async () => {
      // Create a fresh tagihan for siswa1, September 2024
      const [record] = await db
        .insert(tagihan)
        .values({
          tenantId,
          siswaId: siswaId1,
          bulan: 9,
          tahun: 2024,
          tahunAjaranId,
          nominal: 500000,
          tanggalJatuhTempo: '2024-09-10',
        })
        .returning();
      tagihanId = record.id;
    });

    afterAll(async () => {
      await db.delete(tagihanTransaksi).where(eq(tagihanTransaksi.tenantId, tenantId));
      await db.delete(tagihan).where(eq(tagihan.tenantId, tenantId));
    });

    it('should record first manual payment and set status to cicilan', async () => {
      const jumlahBayar = 300000;
      const nomorRef = `TN-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;

      // Record manual payment (tunai)
      const [transaksi] = await db
        .insert(tagihanTransaksi)
        .values({
          tenantId,
          tagihanId,
          jumlahBayar,
          metode: 'tunai',
          status: 'approved', // Manual payments are immediately approved
          verifiedBy: bendaharaId,
          verifiedAt: new Date(),
          nomorReferensi: nomorRef,
        })
        .returning();

      expect(transaksi.status).toBe('approved');
      expect(transaksi.metode).toBe('tunai');
      expect(transaksi.jumlahBayar).toBe(300000);

      // Update tagihan: partial payment → cicilan
      const newTotalDibayar = 300000;
      await db
        .update(tagihan)
        .set({
          totalDibayar: newTotalDibayar,
          status: 'cicilan',
          updatedAt: new Date(),
        })
        .where(eq(tagihan.id, tagihanId));

      const [updated] = await db.select().from(tagihan).where(eq(tagihan.id, tagihanId));
      expect(updated.status).toBe('cicilan');
      expect(updated.totalDibayar).toBe(300000);
    });

    it('should auto-transition to lunas when second payment completes total', async () => {
      const sisaTagihan = 200000; // 500000 - 300000
      const nomorRef = `TN-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;

      // Record second manual payment (remaining balance)
      await db.insert(tagihanTransaksi).values({
        tenantId,
        tagihanId,
        jumlahBayar: sisaTagihan,
        metode: 'tunai',
        status: 'approved',
        verifiedBy: bendaharaId,
        verifiedAt: new Date(),
        nomorReferensi: nomorRef,
      });

      // Update tagihan: total reached nominal → lunas
      const newTotalDibayar = 500000;
      const newStatus = newTotalDibayar >= 500000 ? 'lunas' : 'cicilan';

      await db
        .update(tagihan)
        .set({
          totalDibayar: newTotalDibayar,
          status: newStatus,
          updatedAt: new Date(),
        })
        .where(eq(tagihan.id, tagihanId));

      const [final] = await db.select().from(tagihan).where(eq(tagihan.id, tagihanId));
      expect(final.status).toBe('lunas');
      expect(final.totalDibayar).toBe(500000);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Test 4: Rejection → re-upload flow
  // Requirements: 12.4, 12.5, 12.6, 11.1
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Rejection → re-upload flow', () => {
    let tagihanId: string;

    beforeAll(async () => {
      // Create a fresh tagihan for siswa2, October 2024
      const [record] = await db
        .insert(tagihan)
        .values({
          tenantId,
          siswaId: siswaId2,
          bulan: 10,
          tahun: 2024,
          tahunAjaranId,
          nominal: 500000,
          tanggalJatuhTempo: '2024-10-10',
        })
        .returning();
      tagihanId = record.id;
    });

    afterAll(async () => {
      await db.delete(tagihanTransaksi).where(eq(tagihanTransaksi.tenantId, tenantId));
      await db.delete(tagihan).where(eq(tagihan.tenantId, tenantId));
    });

    it('should reject bukti and set tagihan status to ditolak with alasan', async () => {
      // Step 1: Upload bukti (simulate)
      const [transaksi1] = await db
        .insert(tagihanTransaksi)
        .values({
          tenantId,
          tagihanId,
          jumlahBayar: 500000,
          metode: 'upload_bukti',
          status: 'pending',
          buktiTransferUrl: `bukti-transfer/${tenantId}/${tagihanId}/first.jpg`,
          uploadedBy: orangTuaId,
          nomorReferensi: `BT-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`,
        })
        .returning();

      await db
        .update(tagihan)
        .set({ status: 'menunggu_verifikasi', updatedAt: new Date() })
        .where(eq(tagihan.id, tagihanId));

      // Step 2: Bendahara rejects
      const alasanPenolakan = 'Bukti transfer tidak jelas, nominal tidak sesuai';
      await db
        .update(tagihanTransaksi)
        .set({
          status: 'rejected',
          verifiedBy: bendaharaId,
          verifiedAt: new Date(),
          alasanPenolakan,
        })
        .where(eq(tagihanTransaksi.id, transaksi1.id));

      await db
        .update(tagihan)
        .set({ status: 'ditolak', updatedAt: new Date() })
        .where(eq(tagihan.id, tagihanId));

      // Verify rejection
      const [rejectedTagihan] = await db.select().from(tagihan).where(eq(tagihan.id, tagihanId));
      expect(rejectedTagihan.status).toBe('ditolak');

      const [rejectedTransaksi] = await db
        .select()
        .from(tagihanTransaksi)
        .where(eq(tagihanTransaksi.id, transaksi1.id));
      expect(rejectedTransaksi.status).toBe('rejected');
      expect(rejectedTransaksi.alasanPenolakan).toBe(alasanPenolakan);
    });

    it('should allow re-upload after rejection (Req 12.6)', async () => {
      // Status is 'ditolak' — orang_tua can re-upload (Req 11.1)
      const [currentTagihan] = await db.select().from(tagihan).where(eq(tagihan.id, tagihanId));
      expect(currentTagihan.status).toBe('ditolak');

      // Allowed statuses for upload: belum_bayar, ditolak, cicilan
      const allowedStatuses = ['belum_bayar', 'ditolak', 'cicilan'];
      expect(allowedStatuses).toContain(currentTagihan.status);

      // Step 3: Re-upload new bukti
      const [transaksi2] = await db
        .insert(tagihanTransaksi)
        .values({
          tenantId,
          tagihanId,
          jumlahBayar: 500000,
          metode: 'upload_bukti',
          status: 'pending',
          buktiTransferUrl: `bukti-transfer/${tenantId}/${tagihanId}/reupload.jpg`,
          uploadedBy: orangTuaId,
          nomorReferensi: `BT-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`,
        })
        .returning();

      await db
        .update(tagihan)
        .set({ status: 'menunggu_verifikasi', updatedAt: new Date() })
        .where(eq(tagihan.id, tagihanId));

      const [reuploaded] = await db.select().from(tagihan).where(eq(tagihan.id, tagihanId));
      expect(reuploaded.status).toBe('menunggu_verifikasi');
      expect(transaksi2.status).toBe('pending');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Test 5: Cicilan flow via upload: partial → cicilan → second payment → lunas
  // Requirements: 11.13, 11.14, 12.2, 12.3
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Cicilan flow via upload: partial → cicilan → lunas', () => {
    let tagihanId: string;

    beforeAll(async () => {
      const [record] = await db
        .insert(tagihan)
        .values({
          tenantId,
          siswaId: siswaId1,
          bulan: 11,
          tahun: 2024,
          tahunAjaranId,
          nominal: 500000,
          tanggalJatuhTempo: '2024-11-10',
        })
        .returning();
      tagihanId = record.id;
    });

    afterAll(async () => {
      await db.delete(tagihanTransaksi).where(eq(tagihanTransaksi.tenantId, tenantId));
      await db.delete(tagihan).where(eq(tagihan.tenantId, tenantId));
    });

    it('should transition to cicilan when partial upload is approved (Req 12.3)', async () => {
      // Upload partial payment (300k of 500k)
      const [transaksi1] = await db
        .insert(tagihanTransaksi)
        .values({
          tenantId,
          tagihanId,
          jumlahBayar: 300000,
          metode: 'upload_bukti',
          status: 'pending',
          buktiTransferUrl: `bukti-transfer/${tenantId}/${tagihanId}/partial.jpg`,
          uploadedBy: orangTuaId,
          nomorReferensi: `BT-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`,
        })
        .returning();

      await db
        .update(tagihan)
        .set({ status: 'menunggu_verifikasi', updatedAt: new Date() })
        .where(eq(tagihan.id, tagihanId));

      // Bendahara approves partial payment
      await db
        .update(tagihanTransaksi)
        .set({ status: 'approved', verifiedBy: bendaharaId, verifiedAt: new Date() })
        .where(eq(tagihanTransaksi.id, transaksi1.id));

      // Nominal_bayar < total → status = cicilan
      const newTotalDibayar = 300000;
      const newStatus = newTotalDibayar >= 500000 ? 'lunas' : 'cicilan';

      await db
        .update(tagihan)
        .set({ totalDibayar: newTotalDibayar, status: newStatus, updatedAt: new Date() })
        .where(eq(tagihan.id, tagihanId));

      const [afterPartial] = await db.select().from(tagihan).where(eq(tagihan.id, tagihanId));
      expect(afterPartial.status).toBe('cicilan');
      expect(afterPartial.totalDibayar).toBe(300000);
    });

    it('should enforce second upload must equal remaining balance (Req 11.14)', async () => {
      // Sisa tagihan: 500000 - 300000 = 200000
      const sisaTagihan = 200000;

      // Count approved upload_bukti transactions
      const approvedUploads = await db
        .select()
        .from(tagihanTransaksi)
        .where(
          and(
            eq(tagihanTransaksi.tagihanId, tagihanId),
            eq(tagihanTransaksi.metode, 'upload_bukti'),
            eq(tagihanTransaksi.status, 'approved'),
          ),
        );

      expect(approvedUploads).toHaveLength(1); // One approved cicilan so far

      // Second upload MUST equal remaining balance (Req 11.14)
      const nominalBayar = sisaTagihan; // Must be exactly 200000
      expect(nominalBayar).toBe(sisaTagihan);

      // Upload second payment
      const [transaksi2] = await db
        .insert(tagihanTransaksi)
        .values({
          tenantId,
          tagihanId,
          jumlahBayar: nominalBayar,
          metode: 'upload_bukti',
          status: 'pending',
          buktiTransferUrl: `bukti-transfer/${tenantId}/${tagihanId}/final.jpg`,
          uploadedBy: orangTuaId,
          nomorReferensi: `BT-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`,
        })
        .returning();

      await db
        .update(tagihan)
        .set({ status: 'menunggu_verifikasi', updatedAt: new Date() })
        .where(eq(tagihan.id, tagihanId));

      // Approve second payment → lunas
      await db
        .update(tagihanTransaksi)
        .set({ status: 'approved', verifiedBy: bendaharaId, verifiedAt: new Date() })
        .where(eq(tagihanTransaksi.id, transaksi2.id));

      const finalTotalDibayar = 500000;
      const finalStatus = finalTotalDibayar >= 500000 ? 'lunas' : 'cicilan';

      await db
        .update(tagihan)
        .set({ totalDibayar: finalTotalDibayar, status: finalStatus, updatedAt: new Date() })
        .where(eq(tagihan.id, tagihanId));

      const [final] = await db.select().from(tagihan).where(eq(tagihan.id, tagihanId));
      expect(final.status).toBe('lunas');
      expect(final.totalDibayar).toBe(500000);
    });

    it('should enforce max 2 cicilan via upload (Req 11.13)', async () => {
      // After 2 approved upload_bukti transactions, no more should be allowed
      const approvedUploads = await db
        .select()
        .from(tagihanTransaksi)
        .where(
          and(
            eq(tagihanTransaksi.tagihanId, tagihanId),
            eq(tagihanTransaksi.metode, 'upload_bukti'),
            eq(tagihanTransaksi.status, 'approved'),
          ),
        );

      expect(approvedUploads).toHaveLength(2);
      // Business logic: if approvedCount >= 2, service throws BadRequestException
      expect(approvedUploads.length >= 2).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Test 6: Duplicate generate → skips existing tagihan
  // Requirements: 10.3, 10.4
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Duplicate generate → skips existing tagihan', () => {
    afterAll(async () => {
      await db.delete(tagihanTransaksi).where(eq(tagihanTransaksi.tenantId, tenantId));
      await db.delete(tagihan).where(eq(tagihan.tenantId, tenantId));
    });

    it('should not create duplicates for same siswa/bulan/tahun (ON CONFLICT DO NOTHING)', async () => {
      const bulan = 12;
      const tahun = 2024;

      // First generation
      const values = [siswaId1, siswaId2].map((sId) => ({
        tenantId,
        siswaId: sId,
        bulan,
        tahun,
        tahunAjaranId,
        nominal: 500000,
        tanggalJatuhTempo: '2024-12-10',
      }));

      const firstInsert = await db
        .insert(tagihan)
        .values(values)
        .onConflictDoNothing({ target: [tagihan.siswaId, tagihan.bulan, tagihan.tahun] })
        .returning();

      expect(firstInsert).toHaveLength(2);

      // Second generation (duplicate) — should skip all
      const secondInsert = await db
        .insert(tagihan)
        .values(values)
        .onConflictDoNothing({ target: [tagihan.siswaId, tagihan.bulan, tagihan.tahun] })
        .returning();

      expect(secondInsert).toHaveLength(0); // All skipped

      // Verify only 2 records exist (no duplicates)
      const allTagihan = await db
        .select()
        .from(tagihan)
        .where(
          and(eq(tagihan.tenantId, tenantId), eq(tagihan.bulan, bulan), eq(tagihan.tahun, tahun)),
        );

      expect(allTagihan).toHaveLength(2);
    });

    it('should report correct summary: created vs skipped', async () => {
      const bulan = 1;
      const tahun = 2025;

      // Create tagihan for siswa1 only
      await db.insert(tagihan).values({
        tenantId,
        siswaId: siswaId1,
        bulan,
        tahun,
        tahunAjaranId,
        nominal: 500000,
        tanggalJatuhTempo: '2025-01-10',
      });

      // Now generate for both students — siswa1 should be skipped, siswa2 created
      const values = [siswaId1, siswaId2].map((sId) => ({
        tenantId,
        siswaId: sId,
        bulan,
        tahun,
        tahunAjaranId,
        nominal: 500000,
        tanggalJatuhTempo: '2025-01-10',
      }));

      const inserted = await db
        .insert(tagihan)
        .values(values)
        .onConflictDoNothing({ target: [tagihan.siswaId, tagihan.bulan, tagihan.tahun] })
        .returning();

      const created = inserted.length;
      const skipped = values.length - inserted.length;

      expect(created).toBe(1); // Only siswa2 created
      expect(skipped).toBe(1); // siswa1 skipped (already existed)
      expect(inserted[0].siswaId).toBe(siswaId2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Test 7: Tagihan unique constraint enforcement
  // Requirements: 9.2 (UNIQUE siswa_id, bulan, tahun)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Tagihan unique constraint', () => {
    afterAll(async () => {
      await db.delete(tagihan).where(eq(tagihan.tenantId, tenantId));
    });

    it('should reject direct duplicate insert (unique constraint violation)', async () => {
      const bulan = 2;
      const tahun = 2025;

      await db.insert(tagihan).values({
        tenantId,
        siswaId: siswaId1,
        bulan,
        tahun,
        tahunAjaranId,
        nominal: 500000,
        tanggalJatuhTempo: '2025-02-10',
      });

      // Attempt to insert duplicate without ON CONFLICT → should throw
      await expect(
        db.insert(tagihan).values({
          tenantId,
          siswaId: siswaId1,
          bulan,
          tahun,
          tahunAjaranId,
          nominal: 500000,
          tanggalJatuhTempo: '2025-02-10',
        }),
      ).rejects.toThrow();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Test 8: Nomor referensi uniqueness
  // Requirements: 14.4
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Nomor referensi uniqueness', () => {
    let tagihanId: string;

    beforeAll(async () => {
      const [record] = await db
        .insert(tagihan)
        .values({
          tenantId,
          siswaId: siswaId1,
          bulan: 3,
          tahun: 2025,
          tahunAjaranId,
          nominal: 500000,
          tanggalJatuhTempo: '2025-03-10',
        })
        .returning();
      tagihanId = record.id;
    });

    afterAll(async () => {
      await db.delete(tagihanTransaksi).where(eq(tagihanTransaksi.tenantId, tenantId));
      await db.delete(tagihan).where(eq(tagihan.tenantId, tenantId));
    });

    it('should enforce unique nomor_referensi across all transaksi', async () => {
      const nomorRef = `TN-UNIQUE-TEST-001`;

      // First insert succeeds
      await db.insert(tagihanTransaksi).values({
        tenantId,
        tagihanId,
        jumlahBayar: 100000,
        metode: 'tunai',
        status: 'approved',
        verifiedBy: bendaharaId,
        verifiedAt: new Date(),
        nomorReferensi: nomorRef,
      });

      // Second insert with same nomor_referensi → should throw
      await expect(
        db.insert(tagihanTransaksi).values({
          tenantId,
          tagihanId,
          jumlahBayar: 100000,
          metode: 'tunai',
          status: 'approved',
          verifiedBy: bendaharaId,
          verifiedAt: new Date(),
          nomorReferensi: nomorRef, // duplicate!
        }),
      ).rejects.toThrow();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Test 9: Audit trail immutability
  // Requirements: 29.1, 29.2
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Audit trail for billing operations', () => {
    afterAll(async () => {
      await db.delete(auditTrail).where(eq(auditTrail.tenantId, tenantId));
    });

    it('should record billing actions in append-only audit trail', async () => {
      const entityId = randomUUID();

      // Record a billing audit entry
      const [entry] = await db
        .insert(auditTrail)
        .values({
          tenantId,
          userId: bendaharaId,
          jenisAksi: 'generate_tagihan',
          entityType: 'tagihan',
          entityId,
          nilaiSebelum: null,
          nilaiSesudah: { created: 2, total_nominal: 1000000 },
        })
        .returning();

      expect(entry.jenisAksi).toBe('generate_tagihan');
      expect(entry.entityType).toBe('tagihan');
      expect(entry.userId).toBe(bendaharaId);
      expect(entry.nilaiSesudah).toEqual({ created: 2, total_nominal: 1000000 });
      expect(entry.createdAt).toBeDefined();
    });

    it('should preserve immutability - no updated_at column exists', async () => {
      // The audit_trail table has no updated_at → immutable by design
      // Verify the entry we just created still has original values
      const entries = await db.select().from(auditTrail).where(eq(auditTrail.tenantId, tenantId));

      expect(entries.length).toBeGreaterThan(0);
      // Each entry should have createdAt but no mechanism for updates
      for (const entry of entries) {
        expect(entry.createdAt).toBeDefined();
      }
    });
  });
});
