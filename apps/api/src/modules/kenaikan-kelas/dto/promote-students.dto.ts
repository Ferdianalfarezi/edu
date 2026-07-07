import { IsArray, IsNotEmpty, IsOptional, IsUUID, ArrayMinSize } from 'class-validator';

/**
 * DTO for mass class promotion (kenaikan kelas massal).
 * Frontend sends excluded_siswa_ids (students NOT to promote).
 * All active students in source_kelas_id MINUS excluded_siswa_ids will be promoted.
 *
 * Requirements: 30.2, 30.3
 */
export class PromoteStudentsDto {
  @IsUUID()
  @IsNotEmpty()
  source_kelas_id: string;

  @IsOptional()
  @IsUUID()
  target_kelas_id?: string;

  @IsUUID()
  @IsNotEmpty()
  target_tahun_ajaran_id: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  excluded_siswa_ids?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  lulus_ids?: string[];
}
