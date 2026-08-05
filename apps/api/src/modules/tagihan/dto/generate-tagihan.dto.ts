import { IsArray, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

/**
 * DTO for POST /tagihan/generate.
 *
 * Two modes:
 * 1. Per-month: provide bulan + tahun
 * 2. Per-tahun_ajaran: provide tahun_ajaran_id (generates for all months in that academic year)
 *
 * Scope filters (optional, stackable):
 * - kelas_id: limit to one class
 * - siswa_ids: limit to specific students (array of UUIDs)
 *
 * Requirements: 9.1, 10.1
 */
export class GenerateTagihanDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  bulan?: number;

  @IsOptional()
  @IsInt()
  @Min(2020)
  @Max(2050)
  tahun?: number;

  @IsOptional()
  @IsUUID()
  tahun_ajaran_id?: string;

  @IsOptional()
  @IsUUID()
  kelas_id?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  siswa_ids?: string[];
}
