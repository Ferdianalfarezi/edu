import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

const SISWA_STATUS_VALUES = ['aktif', 'pindah_sekolah', 'keluar', 'lulus'] as const;
type SiswaStatusValue = (typeof SISWA_STATUS_VALUES)[number];

export class ListSiswaQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  nisn?: string;

  @IsOptional()
  @IsUUID()
  kelas_id?: string;

  @IsOptional()
  @IsEnum(SISWA_STATUS_VALUES, {
    message: `Status harus salah satu dari: ${SISWA_STATUS_VALUES.join(', ')}`,
  })
  status?: SiswaStatusValue;

  @IsOptional()
  @IsUUID()
  tahun_ajaran_id?: string;
}
