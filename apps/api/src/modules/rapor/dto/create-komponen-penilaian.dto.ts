import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

/**
 * DTO for creating a komponen penilaian (assessment component).
 * Requirements: 36.2, 36.4, 36.5
 */
export class CreateKomponenPenilaianDto {
  @IsString({ message: 'Nama harus berupa string' })
  @IsNotEmpty({ message: 'Nama komponen tidak boleh kosong' })
  @MaxLength(100, { message: 'Nama komponen maksimal 100 karakter' })
  nama: string;

  @IsEnum(['angka', 'huruf', 'deskripsi'], {
    message: 'Tipe harus salah satu dari: angka, huruf, deskripsi',
  })
  tipe: 'angka' | 'huruf' | 'deskripsi';

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

  @IsBoolean({ message: 'is_wajib harus berupa boolean' })
  @IsOptional()
  is_wajib?: boolean;

  @IsInt({ message: 'Urutan harus berupa integer' })
  @Min(0, { message: 'Urutan minimal 0' })
  @IsOptional()
  urutan?: number;
}
