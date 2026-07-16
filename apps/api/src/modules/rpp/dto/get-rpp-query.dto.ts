import { IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Query DTO for GET /rpp — portal listing of published RPP.
 * Supports offset-based pagination (page + page_size).
 * Supports filters: kategori, mapel (mata_pelajaran_id), tahun_terbit, and text search by judul.
 *
 * Requirements: 1.4, 1.5, 1.6, 1.7, 1.11
 */
export class GetRppQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([15, 50, 100], { message: 'page_size harus salah satu dari: 15, 50, 100' })
  page_size?: number;

  @IsOptional()
  @IsUUID('4', { message: 'kategori harus berupa UUID (kategori_id)' })
  kategori?: string;

  @IsOptional()
  @IsUUID('4', { message: 'mapel harus berupa UUID (mata_pelajaran_id)' })
  mapel?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  tahun?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;
}
