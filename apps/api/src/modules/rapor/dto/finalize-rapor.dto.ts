import { IsArray, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * P5 dimension description item.
 * P5 = Projek Penguatan Profil Pelajar Pancasila (Kurikulum Merdeka).
 */
export class P5DimensiDto {
  @IsString({ message: 'dimensi harus berupa string' })
  dimensi: string;

  @IsString({ message: 'deskripsi harus berupa string' })
  deskripsi: string;
}

/**
 * P5 and catatan wali kelas input for a single student.
 * Used during finalization to add wali kelas notes.
 *
 * Requirements: 38.4, 38.5
 */
export class StudentWaliNotesDto {
  @IsUUID('4', { message: 'siswa_id harus berupa UUID' })
  siswa_id: string;

  @IsOptional()
  @IsArray({ message: 'p5_deskripsi harus berupa array' })
  @ValidateNested({ each: true })
  @Type(() => P5DimensiDto)
  p5_deskripsi?: P5DimensiDto[];

  @IsOptional()
  @IsString({ message: 'catatan_wali_kelas harus berupa string' })
  catatan_wali_kelas?: string;
}

/**
 * DTO for POST /rapor/kelas/:kelasId/periode/:periodeId/finalize
 * Optional: student-level P5 and catatan wali kelas can be submitted during finalization.
 *
 * Requirements: 38.1–38.10
 */
export class FinalizeRaporDto {
  @IsOptional()
  @IsArray({ message: 'student_notes harus berupa array' })
  @ValidateNested({ each: true })
  @Type(() => StudentWaliNotesDto)
  student_notes?: StudentWaliNotesDto[];
}
