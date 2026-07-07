import { IsOptional, IsUUID, IsInt, IsString, Min, Max, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Query DTO for GET /rpp — portal listing of published RPP.
 * Supports cursor-based pagination (cursor = RPP ID, sorted by tanggal_publish DESC).
 * Supports filters: kategori, mapel (mata_pelajaran_id), tahun_terbit, and text search by judul.
 *
 * Requirements: 43.1, 43.2, 43.3, 43.7
 */
export class GetRppQueryDto {
  @IsOptional()
  @IsUUID('4', { message: 'cursor harus berupa UUID' })
  cursor?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsUUID('4', { message: 'kategori harus berupa UUID (kategori_id)' })
  kategori?: string;

  @IsOptional()
  @IsUUID('4', { message: 'mapel harus berupa UUID (mata_pelajaran_id)' })
  mapel?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(2000)
  tahun?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;
}
