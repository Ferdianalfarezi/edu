import { IsDateString, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Edit tahun ajaran: nama, rentang tahun ajaran, dan rentang tiap semester.
 * Field yang tidak dikirim tidak berubah.
 */
export class UpdateTahunAjaranDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  nama?: string;

  @IsOptional()
  @IsDateString()
  tanggal_mulai?: string;

  @IsOptional()
  @IsDateString()
  tanggal_selesai?: string;

  @IsOptional()
  @IsDateString()
  semester_1_mulai?: string;

  @IsOptional()
  @IsDateString()
  semester_1_selesai?: string;

  @IsOptional()
  @IsDateString()
  semester_2_mulai?: string;

  @IsOptional()
  @IsDateString()
  semester_2_selesai?: string;
}
