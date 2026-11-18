import { IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

/**
 * Salin jadwal Semester 1 ke Semester 2 dalam satu tahun ajaran.
 * Tanpa kelasId = semua kelas di tahun ajaran itu.
 */
export class SalinSemesterDto {
  @IsNotEmpty()
  @IsUUID()
  tahunAjaranId: string;

  @IsOptional()
  @IsUUID()
  kelasId?: string;
}
