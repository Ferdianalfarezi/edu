import { IsOptional, IsString, IsUUID, IsIn } from 'class-validator';

/**
 * DTO for GET /rapor/export query params.
 *
 * Requirements: 40.1–40.4
 */
export class ExportRaporQueryDto {
  @IsUUID()
  kelas_id: string;

  @IsString()
  @IsIn(['uts_semester_1', 'semester_1', 'uts_semester_2', 'semester_2'])
  periode: string;

  @IsOptional()
  @IsString()
  @IsIn(['xlsx'])
  format?: string = 'xlsx';
}
