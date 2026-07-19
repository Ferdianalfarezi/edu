ALTER TABLE "tenant" ADD COLUMN "hari_kerja" varchar(10) DEFAULT '6_hari' NOT NULL;
DO $$ BEGIN
  ALTER TABLE "tenant" ADD CONSTRAINT "chk_hari_kerja" CHECK ("tenant"."hari_kerja" IN ('5_hari', '6_hari'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;