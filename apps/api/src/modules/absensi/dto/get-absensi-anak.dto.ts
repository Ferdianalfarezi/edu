import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Query DTO for GET /absensi/anak/:siswaId
 * Allows orang_tua to specify month and year for the attendance calendar view.
 * Defaults to current month/year if not provided.
 *
 * Requirements: 8.1, 8.3
 */
export class GetAbsensiAnakQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  bulan?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2030)
  tahun?: number;
}
