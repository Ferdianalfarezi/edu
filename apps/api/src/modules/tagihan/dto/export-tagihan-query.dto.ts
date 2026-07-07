import { IsOptional, IsInt, Min, Max, IsIn } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Query DTO for GET /tagihan/export
 * Enqueue export job for billing report in Excel/CSV format.
 *
 * Requirements: 15.6, 15.7, 15.8
 */
export class ExportTagihanQueryDto {
  @IsIn(['xlsx', 'csv'])
  format: 'xlsx' | 'csv';

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(12)
  periode_bulan?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(2000)
  @Max(2100)
  periode_tahun?: number;
}
