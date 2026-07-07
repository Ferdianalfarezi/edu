import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * DTO for creating a holiday entry.
 */
export class CreateHariLiburDto {
  @IsDateString({}, { message: 'Tanggal harus format ISO date (YYYY-MM-DD)' })
  tanggal: string;

  @IsOptional()
  @IsString({ message: 'Keterangan harus berupa string' })
  @MaxLength(255, { message: 'Keterangan maksimal 255 karakter' })
  keterangan?: string;
}
