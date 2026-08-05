import { IsOptional, IsInt, Min, Max, IsIn, IsString, IsUUID } from 'class-validator';
import { Transform, Type } from 'class-transformer';

/**
 * Query DTO for GET /tagihan/export and GET /tagihan/tunggakan/export.
 * Supports XLSX and PDF formats. Filters mirror listTagihan / getTunggakan.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4
 */
export class ExportTagihanQueryDto {
  @IsIn(['xlsx', 'pdf'])
  format: 'xlsx' | 'pdf';

  // ─── Filters for tagihan list export ───────────────────────────────
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsUUID()
  kelas_id?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  bulan?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  tahun?: number;

  @IsOptional()
  @IsString()
  search?: string;

  // ─── Legacy fields (kept for backward compatibility) ───────────────
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
