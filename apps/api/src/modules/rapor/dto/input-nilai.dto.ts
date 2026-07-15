import {
  IsArray,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Individual komponen value within a student's grade.
 */
export class KomponenNilaiItemDto {
  @IsUUID('4', { message: 'komponen_id harus berupa UUID' })
  komponen_id: string;

  @IsNotEmpty({ message: 'Nilai tidak boleh kosong' })
  nilai: string | number;
}

/**
 * Grade data for a single student.
 */
export class NilaiSiswaDto {
  @IsUUID('4', { message: 'siswa_id harus berupa UUID' })
  siswa_id: string;

  @IsArray({ message: 'komponen harus berupa array' })
  @ValidateNested({ each: true })
  @Type(() => KomponenNilaiItemDto)
  komponen: KomponenNilaiItemDto[];

  @IsOptional()
  @IsString({ message: 'capaian_pembelajaran harus berupa string' })
  capaian_pembelajaran?: string;
}

/**
 * DTO for POST /rapor/nilai
 * Save grade entries (draft or submitted).
 *
 * Requirements: 37.1–37.10
 */
export class InputNilaiDto {
  @IsUUID('4', { message: 'kelas_id harus berupa UUID' })
  kelas_id: string;

  @IsUUID('4', { message: 'mata_pelajaran_id harus berupa UUID' })
  mata_pelajaran_id: string;

  @IsIn(['uts_semester_1', 'semester_1', 'uts_semester_2', 'semester_2'], {
    message:
      'periode_rapor_id harus salah satu dari: uts_semester_1, semester_1, uts_semester_2, semester_2',
  })
  periode_rapor_id: string;

  @IsArray({ message: 'nilai harus berupa array' })
  @ValidateNested({ each: true })
  @Type(() => NilaiSiswaDto)
  nilai: NilaiSiswaDto[];

  @IsEnum(['draft', 'submitted'], {
    message: 'Status harus salah satu dari: draft, submitted',
  })
  status: 'draft' | 'submitted';
}
