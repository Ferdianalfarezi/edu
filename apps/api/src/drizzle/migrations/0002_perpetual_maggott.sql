ALTER TABLE "jadwal_pelajaran" ALTER COLUMN "mata_pelajaran_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "jadwal_pelajaran" ALTER COLUMN "guru_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "jadwal_pelajaran" ADD COLUMN "is_istirahat" boolean DEFAULT false;