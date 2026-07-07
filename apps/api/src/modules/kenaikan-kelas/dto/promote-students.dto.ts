import { IsArray, IsNotEmpty, IsOptional, IsUUID, ArrayMinSize } from 'class-validator';

/**
 * DTO for mass class promotion (kenaikan kelas massal).
 * - siswa_ids: students to promote to target_kelas_id
 * - lulus_ids: highest-grade students to mark as lulus/alumni
 */
export class PromoteStudentsDto {
  @IsUUID()
  @IsNotEmpty()
  sourceKelasId: string;

  @IsUUID()
  @IsNotEmpty()
  targetKelasId: string;

  @IsUUID()
  @IsNotEmpty()
  tahunAjaranBaruId: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  siswaIds: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  lulusIds?: string[];
}
