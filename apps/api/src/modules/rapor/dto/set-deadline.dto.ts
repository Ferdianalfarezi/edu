import { IsDateString, IsOptional } from 'class-validator';

/**
 * DTO for PATCH /rapor/:raporId/deadline
 * Set or clear the deadline for grade input.
 * Requirements: 2.13
 */
export class SetDeadlineDto {
  @IsOptional()
  @IsDateString({}, { message: 'deadline harus berupa string tanggal ISO valid atau null' })
  deadline: string | null;
}
