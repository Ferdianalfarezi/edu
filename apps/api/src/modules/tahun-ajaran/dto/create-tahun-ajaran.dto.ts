import {
  IsString,
  IsNotEmpty,
  IsDateString,
  MaxLength,
  IsOptional,
  IsBoolean,
} from 'class-validator';

export class CreateTahunAjaranDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  nama: string;

  @IsDateString()
  @IsNotEmpty()
  tanggal_mulai: string;

  @IsDateString()
  @IsNotEmpty()
  tanggal_selesai: string;

  @IsOptional()
  @IsBoolean()
  generate_kelas?: boolean;

  /** Opsional. Kalau kosong diisi otomatis: Sem 1 s.d. 31 Des, Sem 2 mulai 1 Jan. */
  @IsOptional()
  @IsDateString()
  semester_1_selesai?: string;

  @IsOptional()
  @IsDateString()
  semester_2_mulai?: string;
}
