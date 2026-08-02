import { IsString, IsNotEmpty, IsOptional, MaxLength, IsIn, IsDateString } from 'class-validator';

export class CreateOnboardingSiswaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  nama: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  nisn?: string;

  @IsOptional()
  @IsString()
  kelasNama?: string;

  @IsOptional()
  @IsIn(['L', 'P'])
  jenisKelamin?: 'L' | 'P';

  @IsOptional()
  @IsDateString()
  tanggalLahir?: string;

  @IsOptional()
  @IsString()
  alamat?: string;

  @IsOptional()
  @IsString()
  namaWali?: string;

  @IsOptional()
  @IsString()
  teleponWali?: string;
}
