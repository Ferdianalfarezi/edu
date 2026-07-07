DO $$ BEGIN
 CREATE TYPE "public"."jenis_kelamin" AS ENUM('L', 'P');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."siswa_status" AS ENUM('aktif', 'pindah_sekolah', 'keluar', 'lulus');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."tahun_ajaran_status" AS ENUM('disiapkan', 'aktif', 'nonaktif');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."user_role" AS ENUM('super_admin', 'admin', 'kepala_sekolah', 'guru', 'bendahara', 'orang_tua');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."status_kehadiran" AS ENUM('hadir', 'izin', 'sakit', 'alpa');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."periode_rapor" AS ENUM('uts_semester_1', 'semester_1', 'uts_semester_2', 'semester_2');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."status_nilai" AS ENUM('draft', 'submitted');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."status_rapor" AS ENUM('draft', 'final');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."tipe_komponen" AS ENUM('angka', 'huruf', 'deskripsi');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."konten_type_rpp" AS ENUM('richtext', 'file');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."status_rpp" AS ENUM('draft', 'published');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nama" varchar(255) NOT NULL,
	"alamat" text,
	"telepon" varchar(20),
	"email" varchar(255),
	"logo_url" varchar(500),
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"nama" varchar(255) NOT NULL,
	"email" varchar(255),
	"phone" varchar(20),
	"password_hash" varchar(255),
	"role" "user_role" NOT NULL,
	"is_active" boolean DEFAULT true,
	"must_change_password" boolean DEFAULT false,
	"failed_login_attempts" integer DEFAULT 0,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tahun_ajaran" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nama" varchar(50) NOT NULL,
	"tanggal_mulai" date NOT NULL,
	"tanggal_selesai" date NOT NULL,
	"status" "tahun_ajaran_status" DEFAULT 'disiapkan' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kelas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tahun_ajaran_id" uuid NOT NULL,
	"nama" varchar(50) NOT NULL,
	"tingkat" integer NOT NULL,
	"wali_kelas_id" uuid,
	"kapasitas" integer,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "siswa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kelas_id" uuid,
	"nama" varchar(255) NOT NULL,
	"nisn" varchar(20),
	"jenis_kelamin" "jenis_kelamin",
	"tanggal_lahir" date,
	"alamat" text,
	"orang_tua_id" uuid,
	"status" "siswa_status" DEFAULT 'aktif',
	"tanggal_keluar" date,
	"alasan_keluar" text,
	"processed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mata_pelajaran" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nama" varchar(100) NOT NULL,
	"kode" varchar(20),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "guru_pengganti" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"guru_pengganti_id" uuid NOT NULL,
	"kelas_id" uuid NOT NULL,
	"mata_pelajaran_id" uuid NOT NULL,
	"tanggal" date NOT NULL,
	"ditugaskan_oleh" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "jadwal_pelajaran" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kelas_id" uuid NOT NULL,
	"mata_pelajaran_id" uuid NOT NULL,
	"guru_id" uuid NOT NULL,
	"tahun_ajaran_id" uuid NOT NULL,
	"semester" integer NOT NULL,
	"hari" varchar(10) NOT NULL,
	"jam_mulai" time NOT NULL,
	"jam_selesai" time NOT NULL,
	"tanggal_mulai_berlaku" date NOT NULL,
	"tanggal_selesai_berlaku" date NOT NULL,
	"is_vacant" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "absensi" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"siswa_id" uuid NOT NULL,
	"kelas_id" uuid NOT NULL,
	"tanggal" date NOT NULL,
	"status" "status_kehadiran" NOT NULL,
	"guru_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "absensi_siswa_tanggal_unique" UNIQUE("siswa_id","tanggal")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "absensi_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"absensi_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(20) NOT NULL,
	"status_sebelum" "status_kehadiran" NOT NULL,
	"status_sesudah" "status_kehadiran" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "komponen_penilaian" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nama" varchar(100) NOT NULL,
	"tipe" "tipe_komponen" NOT NULL,
	"skala_min" integer,
	"skala_max" integer,
	"is_wajib" boolean DEFAULT true,
	"urutan" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rapor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kelas_id" uuid NOT NULL,
	"tahun_ajaran_id" uuid NOT NULL,
	"periode" "periode_rapor" NOT NULL,
	"status" "status_rapor" DEFAULT 'draft' NOT NULL,
	"finalized_by" uuid,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "rapor_kelas_ajaran_periode_unique" UNIQUE("kelas_id","tahun_ajaran_id","periode")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rapor_nilai" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"rapor_id" uuid NOT NULL,
	"siswa_id" uuid NOT NULL,
	"mata_pelajaran_id" uuid NOT NULL,
	"guru_id" uuid NOT NULL,
	"komponen_nilai" jsonb NOT NULL,
	"capaian_pembelajaran" text,
	"status" "status_nilai" DEFAULT 'draft' NOT NULL,
	"peringkat" integer,
	"rata_rata" numeric(5, 2),
	"catatan_wali_kelas" text,
	"p5_deskripsi" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kategori_rpp" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nama" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "uq_kategori_rpp_tenant_nama" UNIQUE("tenant_id","nama")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rpp" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"guru_id" uuid NOT NULL,
	"mata_pelajaran_id" uuid NOT NULL,
	"kategori_id" uuid NOT NULL,
	"judul" varchar(255) NOT NULL,
	"konten_type" "konten_type_rpp" NOT NULL,
	"konten" text,
	"file_url" varchar(500),
	"file_nama" varchar(255),
	"file_size" integer,
	"tahun_terbit" integer NOT NULL,
	"status" "status_rpp" DEFAULT 'draft' NOT NULL,
	"tanggal_publish" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rpp_favorit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guru_id" uuid NOT NULL,
	"rpp_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "uq_rpp_favorit_guru_rpp" UNIQUE("guru_id","rpp_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hari_libur" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tanggal" date NOT NULL,
	"keterangan" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_hari_libur_tenant_tanggal" UNIQUE("tenant_id","tanggal")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "konfigurasi_sekolah" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key" varchar(100) NOT NULL,
	"value" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_konfigurasi_sekolah_tenant_key" UNIQUE("tenant_id","key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "riwayat_kelas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"siswa_id" uuid NOT NULL,
	"kelas_id" uuid NOT NULL,
	"tahun_ajaran_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user" ADD CONSTRAINT "user_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tahun_ajaran" ADD CONSTRAINT "tahun_ajaran_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kelas" ADD CONSTRAINT "kelas_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kelas" ADD CONSTRAINT "kelas_tahun_ajaran_id_tahun_ajaran_id_fk" FOREIGN KEY ("tahun_ajaran_id") REFERENCES "public"."tahun_ajaran"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kelas" ADD CONSTRAINT "kelas_wali_kelas_id_user_id_fk" FOREIGN KEY ("wali_kelas_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "siswa" ADD CONSTRAINT "siswa_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "siswa" ADD CONSTRAINT "siswa_kelas_id_kelas_id_fk" FOREIGN KEY ("kelas_id") REFERENCES "public"."kelas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "siswa" ADD CONSTRAINT "siswa_orang_tua_id_user_id_fk" FOREIGN KEY ("orang_tua_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "siswa" ADD CONSTRAINT "siswa_processed_by_user_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mata_pelajaran" ADD CONSTRAINT "mata_pelajaran_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "guru_pengganti" ADD CONSTRAINT "guru_pengganti_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "guru_pengganti" ADD CONSTRAINT "guru_pengganti_guru_pengganti_id_user_id_fk" FOREIGN KEY ("guru_pengganti_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "guru_pengganti" ADD CONSTRAINT "guru_pengganti_kelas_id_kelas_id_fk" FOREIGN KEY ("kelas_id") REFERENCES "public"."kelas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "guru_pengganti" ADD CONSTRAINT "guru_pengganti_mata_pelajaran_id_mata_pelajaran_id_fk" FOREIGN KEY ("mata_pelajaran_id") REFERENCES "public"."mata_pelajaran"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "guru_pengganti" ADD CONSTRAINT "guru_pengganti_ditugaskan_oleh_user_id_fk" FOREIGN KEY ("ditugaskan_oleh") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "jadwal_pelajaran" ADD CONSTRAINT "jadwal_pelajaran_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "jadwal_pelajaran" ADD CONSTRAINT "jadwal_pelajaran_kelas_id_kelas_id_fk" FOREIGN KEY ("kelas_id") REFERENCES "public"."kelas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "jadwal_pelajaran" ADD CONSTRAINT "jadwal_pelajaran_mata_pelajaran_id_mata_pelajaran_id_fk" FOREIGN KEY ("mata_pelajaran_id") REFERENCES "public"."mata_pelajaran"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "jadwal_pelajaran" ADD CONSTRAINT "jadwal_pelajaran_guru_id_user_id_fk" FOREIGN KEY ("guru_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "jadwal_pelajaran" ADD CONSTRAINT "jadwal_pelajaran_tahun_ajaran_id_tahun_ajaran_id_fk" FOREIGN KEY ("tahun_ajaran_id") REFERENCES "public"."tahun_ajaran"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "absensi" ADD CONSTRAINT "absensi_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "absensi" ADD CONSTRAINT "absensi_siswa_id_siswa_id_fk" FOREIGN KEY ("siswa_id") REFERENCES "public"."siswa"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "absensi" ADD CONSTRAINT "absensi_kelas_id_kelas_id_fk" FOREIGN KEY ("kelas_id") REFERENCES "public"."kelas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "absensi" ADD CONSTRAINT "absensi_guru_id_user_id_fk" FOREIGN KEY ("guru_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "absensi_audit" ADD CONSTRAINT "absensi_audit_absensi_id_absensi_id_fk" FOREIGN KEY ("absensi_id") REFERENCES "public"."absensi"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "absensi_audit" ADD CONSTRAINT "absensi_audit_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hari_libur" ADD CONSTRAINT "hari_libur_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "konfigurasi_sekolah" ADD CONSTRAINT "konfigurasi_sekolah_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "riwayat_kelas" ADD CONSTRAINT "riwayat_kelas_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "riwayat_kelas" ADD CONSTRAINT "riwayat_kelas_siswa_id_siswa_id_fk" FOREIGN KEY ("siswa_id") REFERENCES "public"."siswa"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "riwayat_kelas" ADD CONSTRAINT "riwayat_kelas_kelas_id_kelas_id_fk" FOREIGN KEY ("kelas_id") REFERENCES "public"."kelas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "riwayat_kelas" ADD CONSTRAINT "riwayat_kelas_tahun_ajaran_id_tahun_ajaran_id_fk" FOREIGN KEY ("tahun_ajaran_id") REFERENCES "public"."tahun_ajaran"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_user_email_tenant" ON "user" ("email","tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_phone" ON "user" ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_siswa_nisn_tenant" ON "siswa" ("nisn","tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_siswa_orang_tua" ON "siswa" ("orang_tua_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_jadwal_guru_hari" ON "jadwal_pelajaran" ("guru_id","hari","tanggal_mulai_berlaku","tanggal_selesai_berlaku");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_absensi_tenant_kelas_tanggal" ON "absensi" ("tenant_id","kelas_id","tanggal");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rapor_nilai_rapor" ON "rapor_nilai" ("rapor_id","siswa_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rpp_tenant_status" ON "rpp" ("tenant_id","status","tanggal_publish");