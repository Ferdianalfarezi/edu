import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  IsDateString,
} from 'class-validator';

export class CreateSiswaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  nama: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  nisn?: string;

  @IsOptional()
  @IsEnum(['L', 'P'], { message: 'Jenis kelamin harus L atau P' })
  jenisKelamin?: 'L' | 'P';

  @IsOptional()
  @IsDateString()
  tanggalLahir?: string;

  @IsOptional()
  @IsString()
  alamat?: string;

  @IsOptional()
  @IsUUID()
  kelasId?: string;

  /**
   * Parent linkage fields per ADR-002.
   * On creation, system checks if phone exists globally as orang_tua user.
   */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  orangTuaNama?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  orangTuaPhone?: string;

  @IsOptional()
  @IsEnum(['aktif', 'pindah_sekolah', 'keluar', 'lulus'], {
    message: 'Status harus aktif, pindah_sekolah, keluar, atau lulus',
  })
  status?: 'aktif' | 'pindah_sekolah' | 'keluar' | 'lulus';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  alasanKeluar?: string;
}
