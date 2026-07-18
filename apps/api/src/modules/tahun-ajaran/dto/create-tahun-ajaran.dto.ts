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
}
