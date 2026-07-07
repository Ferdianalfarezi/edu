import { IsOptional, IsUUID, IsInt, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Query DTO for GET /notifikasi/riwayat
 * Supports cursor-based pagination (cursor = notification ID, sorted newest first).
 *
 * Requirements: 7.1
 */
export class GetRiwayatQueryDto {
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
