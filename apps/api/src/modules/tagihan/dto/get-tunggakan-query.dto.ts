import { IsOptional, IsUUID, IsInt, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Query DTO for GET /tagihan/tunggakan
 * Cursor-paginated list of unpaid tagihan (belum_bayar or cicilan),
 * sorted by tanggal_jatuh_tempo ASC (oldest first).
 *
 * Requirements: 15.1, 15.3, 15.4
 */
export class GetTunggakanQueryDto {
  @IsOptional()
  @IsUUID()
  kelas_id?: string;

  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
