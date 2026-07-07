import { IsOptional, IsUUID, IsInt, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class FilterJadwalDto {
  @IsOptional()
  @IsUUID()
  kelasId?: string;

  @IsOptional()
  @IsUUID()
  guruId?: string;

  @IsOptional()
  @IsUUID()
  tahunAjaranId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2])
  semester?: number;

  @IsOptional()
  @IsIn(['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'])
  hari?: string;
}
