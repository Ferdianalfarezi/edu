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
  hadir: number;
  izin: number;
  sakit: number;
  alpa: number;
  total_hari_efektif: number | null;
  persentase_kehadiran: number | null;
}
