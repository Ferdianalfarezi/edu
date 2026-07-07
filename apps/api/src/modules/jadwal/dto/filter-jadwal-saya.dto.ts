import { IsOptional, IsIn, IsDateString } from 'class-validator';

/**
 * Query params for GET /jadwal/saya.
 * - hari: optional day filter (defaults to today's Indonesian day name)
 * - tanggal: optional date for checking guru_pengganti assignments
 *
 * Requirements: 33.1, 33.2
 */
export class FilterJadwalSayaDto {
  @IsOptional()
  @IsIn(['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'])
  hari?: string;

  @IsOptional()
  @IsDateString()
  tanggal?: string;
}
