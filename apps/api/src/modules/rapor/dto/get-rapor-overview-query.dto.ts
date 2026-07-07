import { IsOptional, IsUUID, IsIn } from 'class-validator';

/**
 * Query DTO for GET /rapor/overview
 * Kepala sekolah read-only view of all rapor (draft + final) with filters.
 *
 * Requirements: 38.11, 38.12
 */
export class GetRaporOverviewQueryDto {
  @IsOptional()
  @IsUUID()
  kelas_id?: string;

  @IsOptional()
  @IsIn(['uts_semester_1', 'semester_1', 'uts_semester_2', 'semester_2'])
  periode?: string;

  @IsOptional()
  @IsUUID()
  tahun_ajaran_id?: string;
}
