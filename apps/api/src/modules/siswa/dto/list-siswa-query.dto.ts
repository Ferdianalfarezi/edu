import { IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';

const SISWA_STATUS_VALUES = ['aktif', 'pindah_sekolah', 'keluar', 'lulus'] as const;
type SiswaStatusValue = (typeof SISWA_STATUS_VALUES)[number];

export class ListSiswaQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([15, 50, 100], { message: 'page_size harus salah satu dari: 15, 50, 100' })
  page_size?: number;

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
