DO $$ BEGIN
 CREATE TYPE "public"."metode_pembayaran" AS ENUM('upload_bukti', 'tunai', 'transfer_manual');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."status_pembayaran" AS ENUM('belum_bayar', 'menunggu_verifikasi', 'cicilan', 'lunas', 'ditolak', 'dibatalkan');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."status_transaksi" AS ENUM('pending', 'approved', 'rejected');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."platform_device" AS ENUM('android', 'ios');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."status_pengiriman" AS ENUM('pending', 'terkirim', 'gagal');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_trail" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"jenis_aksi" varchar(50) NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" uuid NOT NULL,
	"nilai_sebelum" jsonb,
	"nilai_sesudah" jsonb,
	"alasan" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tagihan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"siswa_id" uuid NOT NULL,
	"bulan" integer NOT NULL,
	"tahun" integer NOT NULL,
	"tahun_ajaran_id" uuid,
	"nominal" bigint NOT NULL,
	"total_dibayar" bigint DEFAULT 0 NOT NULL,
	"status" "status_pembayaran" DEFAULT 'belum_bayar' NOT NULL,
	"tanggal_jatuh_tempo" date,
	"alasan_pembatalan" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_tagihan_siswa_bulan_tahun" UNIQUE("siswa_id","bulan","tahun")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tagihan_transaksi" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tagihan_id" uuid NOT NULL,
	"jumlah_bayar" bigint NOT NULL,
	"metode" "metode_pembayaran" NOT NULL,
	"status" "status_transaksi" DEFAULT 'pending' NOT NULL,
	"bukti_transfer_url" varchar(500),
	"catatan" text,
	"alasan_penolakan" text,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"uploaded_by" uuid,
	"nomor_referensi" varchar(50),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tagihan_transaksi_nomor_referensi_unique" UNIQUE("nomor_referensi")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "device_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"fcm_token" varchar(500) NOT NULL,
	"platform" "platform_device",
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifikasi" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"siswa_id" uuid,
	"tipe" varchar(50) NOT NULL,
	"judul" varchar(255) NOT NULL,
	"pesan" text NOT NULL,
	"data" jsonb,
	"status_pengiriman" "status_pengiriman" DEFAULT 'pending' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifikasi_preferensi" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"siswa_id" uuid NOT NULL,
	"kehadiran_enabled" boolean DEFAULT false NOT NULL,
	"ketidakhadiran_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_notifikasi_preferensi_user_siswa" UNIQUE("user_id","siswa_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user" ADD COLUMN "tokens_invalidated_at" timestamp with time zone;
EXCEPTION
 WHEN duplicate_column THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_trail_tenant" ON "audit_trail" ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tagihan_tenant_status" ON "tagihan" ("tenant_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tagihan_siswa" ON "tagihan" ("siswa_id","tahun");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notifikasi_user" ON "notifikasi" ("user_id","created_at");