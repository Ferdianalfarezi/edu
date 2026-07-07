import { IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

/**
 * DTO for previewing class promotion before execution.
 */
export class PreviewPromotionDto {
  @IsUUID()
  @IsNotEmpty()
  source_kelas_id: string;

  @IsUUID()
  @IsNotEmpty()
  target_tahun_ajaran_id: string;

  @IsOptional()
  @IsUUID()
  target_kelas_id?: string;
}
