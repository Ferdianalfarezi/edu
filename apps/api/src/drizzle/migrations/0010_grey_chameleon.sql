DO $$ BEGIN
 CREATE TYPE "public"."kategori_barang" AS ENUM('peralatan', 'perlengkapan');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."kondisi_barang" AS ENUM('bagus', 'perlu_perbaikan', 'rusak');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."sumber_dana" AS ENUM('yayasan', 'unit_sekolah', 'bos');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."konfigurasi_biaya_type" AS ENUM('per_siswa', 'per_kelas');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "konfigurasi_biaya" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"type" "konfigurasi_biaya_type" NOT NULL,
	"siswa_id" uuid,
	"kelas_id" uuid,
	"nominal" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_trail" ADD COLUMN IF NOT EXISTS "aksi_label" varchar(100);--> statement-breakpoint
ALTER TABLE "audit_trail" ADD COLUMN IF NOT EXISTS "perubahan" jsonb;--> statement-breakpoint
ALTER TABLE "barang" ADD COLUMN IF NOT EXISTS "lokasi" varchar(255);--> statement-breakpoint
ALTER TABLE "barang" ADD COLUMN IF NOT EXISTS "kondisi_barang" "kondisi_barang";--> statement-breakpoint
ALTER TABLE "barang" ADD COLUMN IF NOT EXISTS "sumber_dana" "sumber_dana";--> statement-breakpoint
ALTER TABLE "barang" ADD COLUMN IF NOT EXISTS "kategori" "kategori_barang";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_konfigbiaya_tenant_siswa" ON "konfigurasi_biaya" ("tenant_id","siswa_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_konfigbiaya_tenant_kelas" ON "konfigurasi_biaya" ("tenant_id","kelas_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_barang_kondisi" ON "barang" ("tenant_id","kondisi_barang");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_barang_sumber_dana" ON "barang" ("tenant_id","sumber_dana");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_barang_kategori" ON "barang" ("tenant_id","kategori");