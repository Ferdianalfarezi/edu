ALTER TABLE "riwayat_kelas" ADD COLUMN IF NOT EXISTS "tanggal_mulai" date;--> statement-breakpoint
UPDATE "riwayat_kelas" SET "tanggal_mulai" = "created_at"::date WHERE "tanggal_mulai" IS NULL;