import { IsOptional, IsUUID, IsIn, IsDateString, IsInt, Min, Max } from 'class-validator';

export class UpdateJadwalDto {
  @IsOptional()
  @IsUUID()
  guruId?: string;

  @IsOptional()
  @IsUUID()
  mataPelajaranId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  jamKe?: number;

  @IsOptional()
  @IsDateString()
  tanggalMulaiBerlaku?: string;

  @IsOptional()
  @IsDateString()
  tanggalSelesaiBerlaku?: string;

  @IsOptional()
  @IsIn(['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'])
  hari?: string;
}
