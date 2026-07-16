import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class RekapAbsensiQueryDto {
  @IsUUID()
  kelas_id: string;

  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(12)
  bulan: number;

  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(2000)
  @Max(2100)
  tahun: number;

  @IsEnum(['bulanan', 'semester'], {
    message: 'periode harus salah satu dari: bulanan, semester',
  })
  @IsOptional()
  periode?: 'bulanan' | 'semester' = 'bulanan';
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
  hari_efektif_source: 'manual' | 'otomatis' | null;
  data: RekapAbsensiItem[];
}
