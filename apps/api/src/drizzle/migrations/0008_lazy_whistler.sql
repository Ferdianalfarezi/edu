DO $$ BEGIN
 CREATE TYPE "public"."pengumuman_mode" AS ENUM('broadcast', 'targeted');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."pengumuman_status" AS ENUM('draft', 'terkirim', 'gagal');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pengumuman" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"judul" varchar(255) NOT NULL,
	"deskripsi" text NOT NULL,
	"mode" "pengumuman_mode" NOT NULL,
	"jumlah_penerima" integer DEFAULT 0 NOT NULL,
	"status" "pengumuman_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pengumuman_penerima" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pengumuman_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jadwal_pelajaran" ADD COLUMN "jam_ke" integer NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pengumuman" ADD CONSTRAINT "pengumuman_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pengumuman" ADD CONSTRAINT "pengumuman_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pengumuman_penerima" ADD CONSTRAINT "pengumuman_penerima_pengumuman_id_pengumuman_id_fk" FOREIGN KEY ("pengumuman_id") REFERENCES "public"."pengumuman"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pengumuman_penerima" ADD CONSTRAINT "pengumuman_penerima_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pengumuman_tenant_created" ON "pengumuman" ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_pengumuman_penerima_unique" ON "pengumuman_penerima" ("pengumuman_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pengumuman_penerima_user" ON "pengumuman_penerima" ("user_id");--> statement-breakpoint
ALTER TABLE "jadwal_pelajaran" DROP COLUMN IF EXISTS "jam_mulai";--> statement-breakpoint
ALTER TABLE "jadwal_pelajaran" DROP COLUMN IF EXISTS "jam_selesai";