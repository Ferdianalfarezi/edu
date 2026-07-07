import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UpdateSiswaDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  nama?: string;

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

  @IsOptional()
  @IsString()
  @MaxLength(255)
  orangTuaNama?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  orangTuaPhone?: string;
}
