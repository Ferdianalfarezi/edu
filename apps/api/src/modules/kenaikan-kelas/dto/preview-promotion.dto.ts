import { IsNotEmpty, IsUUID } from 'class-validator';

/**
 * DTO for previewing class promotion before execution.
 */
export class PreviewPromotionDto {
  @IsUUID()
  @IsNotEmpty()
  sourceKelasId: string;

  @IsUUID()
  @IsNotEmpty()
  tahunAjaranBaruId: string;
}
