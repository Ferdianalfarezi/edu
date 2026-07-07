import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

/**
 * DTO for updating a komponen penilaian (assessment component).
 * All fields optional — partial update.
 * Requirements: 36.2
 */
export class UpdateKomponenPenilaianDto {
  @IsOptional()
  @IsString({ message: 'Nama harus berupa string' })
  @MaxLength(100, { message: 'Nama komponen maksimal 100 karakter' })
  nama?: string;

  @IsOptional()
  @IsEnum(['angka', 'huruf', 'deskripsi'], {
    message: 'Tipe harus salah satu dari: angka, huruf, deskripsi',
  })
  tipe?: 'angka' | 'huruf' | 'deskripsi';

  @ValidateIf((o) => o.tipe === 'angka')
  @IsInt({ message: 'Skala min harus berupa integer' })
  @Min(0, { message: 'Skala min minimal 0' })
  @IsOptional()
  skala_min?: number;

  @ValidateIf((o) => o.tipe === 'angka')
  @IsInt({ message: 'Skala max harus berupa integer' })
  @Min(1, { message: 'Skala max minimal 1' })
  @Max(1000, { message: 'Skala max maksimal 1000' })
  @IsOptional()
  skala_max?: number;

  @IsOptional()
  @IsBoolean({ message: 'is_wajib harus berupa boolean' })
  is_wajib?: boolean;

  @IsOptional()
  @IsInt({ message: 'Urutan harus berupa integer' })
  @Min(0, { message: 'Urutan minimal 0' })
  urutan?: number;
}
