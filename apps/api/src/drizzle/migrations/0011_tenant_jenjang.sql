-- Jenjang sekolah (sd/smp/sma) untuk label kelas: SMP tingkat 1 = Kelas 7, SMA tingkat 1 = Kelas 10
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "jenjang" varchar(10);
--> statement-breakpoint
UPDATE "tenant" SET "jenjang" = CASE WHEN "jumlah_tingkat" = 6 THEN 'sd' WHEN "jumlah_tingkat" = 3 THEN 'smp' ELSE NULL END WHERE "jenjang" IS NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant" ADD CONSTRAINT "chk_jenjang" CHECK ("jenjang" IS NULL OR "jenjang" IN ('sd', 'smp', 'sma'));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
