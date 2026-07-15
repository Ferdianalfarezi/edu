import { IsIn, IsUUID } from 'class-validator';

/**
 * DTO for POST /rapor/nilai/unsubmit
 * Allows guru to revert submitted grades back to draft.
 * Requirements: 2.4
 */
export class UnsubmitNilaiDto {
  @IsUUID('4', { message: 'kelas_id harus berupa UUID' })
  kelas_id: string;

  @IsUUID('4', { message: 'mata_pelajaran_id harus berupa UUID' })
  mata_pelajaran_id: string;

  @IsIn(['uts_semester_1', 'semester_1', 'uts_semester_2', 'semester_2'], {
    message:
      'periode_rapor_id harus salah satu dari: uts_semester_1, semester_1, uts_semester_2, semester_2',
  })
  periode_rapor_id: string;
}
