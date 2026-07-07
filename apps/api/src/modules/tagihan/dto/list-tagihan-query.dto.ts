import { IsOptional, IsString, IsInt, Min, Max, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Query DTO for GET /tagihan (list tagihan with pagination and filters).
 */
export class ListTagihanQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsUUID()
  kelas_id?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  bulan?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  tahun?: number;

  @IsOptional()
  @IsString()
  search?: string;
}
