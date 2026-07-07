import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

const SISWA_STATUS_VALUES = ['aktif', 'pindah_sekolah', 'keluar', 'lulus'] as const;
type SiswaStatusValue = (typeof SISWA_STATUS_VALUES)[number];

export class ListSiswaQueryDto {
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
  kelasId?: string;

  @IsOptional()
  @IsEnum(SISWA_STATUS_VALUES, {
    message: `Status harus salah satu dari: ${SISWA_STATUS_VALUES.join(', ')}`,
  })
  status?: SiswaStatusValue;

  @IsOptional()
  @IsUUID()
  tahunAjaranId?: string;
}
