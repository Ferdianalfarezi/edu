import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class RekapAbsensiQueryDto {
  @IsUUID()
  kelas_id: string;

  @Transform(({ value }) => (value !== undefined ? parseInt(value, 10) : undefined))
  @IsInt()
  @Min(1)
  @Max(12)
  @IsOptional()
  bulan?: number;

  /** Wajib untuk periode bulanan. Untuk semester tidak dipakai (tanggal diambil dari tahun ajaran kelas). */
  @Transform(({ value }) => (value !== undefined ? parseInt(value, 10) : undefined))
  @IsInt()
  @Min(2000)
  @Max(2100)
  @IsOptional()
  tahun?: number;

  @IsEnum(['bulanan', 'semester'], {
    message: 'periode harus salah satu dari: bulanan, semester',
  })
  @IsOptional()
  periode?: 'bulanan' | 'semester' = 'bulanan';

  @Transform(({ value }) => (value !== undefined ? parseInt(value, 10) : undefined))
  @IsInt()
  @Min(1)
  @Max(2)
  @IsOptional()
  semester?: number;
}

export interface RekapAbsensiItem {
  siswa_id: string;
  siswa_nama: string;
  siswa_nisn: string | null;
  hadir: number;
  izin: number;
  sakit: number;
  alpa: number;
  persentase_kehadiran: number | null;
}

export interface RekapAbsensiResponse {
  kelas_id: string;
  kelas_nama: string;
  bulan: number;
  tahun: number;
  periode: 'bulanan' | 'semester';
  total_hari_efektif: number | null;
  hari_efektif_source: 'manual' | 'otomatis' | 'campuran' | null;
  /** Rentang tanggal yang dihitung */
  tanggal_mulai: string;
  tanggal_selesai: string;
  /** Diisi untuk periode semester */
  semester: number | null;
  tahun_ajaran_nama: string | null;
  data: RekapAbsensiItem[];
}
