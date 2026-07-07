import { IsOptional, IsUUID, IsDateString } from 'class-validator';

/**
 * DTO for filtering guru pengganti assignments.
 * Supports filtering by kelasId and/or tanggal.
 */
export class FilterGuruPenggantiDto {
  @IsOptional()
  @IsUUID()
  kelasId?: string;

  @IsOptional()
  @IsDateString()
  tanggal?: string;
}
