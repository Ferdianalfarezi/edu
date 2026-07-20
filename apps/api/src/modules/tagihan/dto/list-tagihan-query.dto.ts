import { IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Query DTO for GET /tagihan (list tagihan with offset pagination and filters).
 */
export class ListTagihanQueryDto {
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
  @IsString()
  status?: string;

  @IsOptional()
  @IsUUID()
  kelas_id?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  bulan?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  tahun?: number;

  @IsOptional()
  @IsString()
  search?: string;
}
