import { IsDateString, IsNotEmpty } from 'class-validator';

/**
 * Ubah rentang semester sebuah tahun ajaran.
 * Semester 1 selalu mulai di tanggal mulai TA dan Semester 2 selalu selesai di tanggal selesai TA,
 * jadi yang diatur cuma batas di tengahnya.
 */
export class UpdateSemesterDto {
  @IsDateString()
  @IsNotEmpty()
  semester_1_selesai: string;

  @IsDateString()
  @IsNotEmpty()
  semester_2_mulai: string;
}
