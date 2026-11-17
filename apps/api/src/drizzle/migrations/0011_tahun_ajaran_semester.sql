-- Rentang semester di dalam tahun ajaran.
-- Data lama diisi otomatis: Semester 1 = tanggal mulai TA s.d. 31 Des, Semester 2 = 1 Jan s.d. tanggal selesai TA.
-- (Kalau 1 Jan tidak jatuh di dalam TA, batasnya diambil dari tengah-tengah TA.)
ALTER TABLE "tahun_ajaran" ADD COLUMN "semester_1_mulai" date;--> statement-breakpoint
ALTER TABLE "tahun_ajaran" ADD COLUMN "semester_1_selesai" date;--> statement-breakpoint
ALTER TABLE "tahun_ajaran" ADD COLUMN "semester_2_mulai" date;--> statement-breakpoint
ALTER TABLE "tahun_ajaran" ADD COLUMN "semester_2_selesai" date;--> statement-breakpoint
UPDATE "tahun_ajaran" SET
  "semester_1_mulai" = "tanggal_mulai",
  "semester_2_selesai" = "tanggal_selesai",
  "semester_2_mulai" = CASE
    WHEN make_date(EXTRACT(YEAR FROM "tanggal_mulai")::int + 1, 1, 1) > "tanggal_mulai"
     AND make_date(EXTRACT(YEAR FROM "tanggal_mulai")::int + 1, 1, 1) <= "tanggal_selesai"
    THEN make_date(EXTRACT(YEAR FROM "tanggal_mulai")::int + 1, 1, 1)
    ELSE "tanggal_mulai" + (("tanggal_selesai" - "tanggal_mulai") / 2 + 1)
  END;--> statement-breakpoint
UPDATE "tahun_ajaran" SET "semester_1_selesai" = "semester_2_mulai" - 1;--> statement-breakpoint
ALTER TABLE "tahun_ajaran" ALTER COLUMN "semester_1_mulai" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tahun_ajaran" ALTER COLUMN "semester_1_selesai" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tahun_ajaran" ALTER COLUMN "semester_2_mulai" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tahun_ajaran" ALTER COLUMN "semester_2_selesai" SET NOT NULL;
