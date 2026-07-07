import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SoftDeleteSiswaDto {
  @IsEnum(['pindah_sekolah', 'keluar'], {
    message: 'Status harus pindah_sekolah atau keluar',
  })
  @IsNotEmpty()
  status: 'pindah_sekolah' | 'keluar';

  @IsOptional()
  @IsString()
  alasanKeluar?: string;
}
