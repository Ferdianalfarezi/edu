CREATE TABLE IF NOT EXISTS "komponen_penilaian_mapel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"komponen_penilaian_id" uuid NOT NULL,
	"mata_pelajaran_id" uuid NOT NULL,
	CONSTRAINT "komponen_penilaian_mapel_unique" UNIQUE("tenant_id","komponen_penilaian_id","mata_pelajaran_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rapor_nilai_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"rapor_nilai_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"action" varchar(10) NOT NULL,
	"siswa_id" uuid NOT NULL,
	"mata_pelajaran_id" uuid NOT NULL,
	"komponen_id" uuid,
	"old_value" text,
	"new_value" text NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "komponen_penilaian" ADD COLUMN "bobot_huruf" jsonb;--> statement-breakpoint
ALTER TABLE "rapor" ADD COLUMN "deadline" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rapor_nilai" ADD CONSTRAINT "rapor_nilai_upsert_unique" UNIQUE("rapor_id","siswa_id","mata_pelajaran_id","tenant_id");