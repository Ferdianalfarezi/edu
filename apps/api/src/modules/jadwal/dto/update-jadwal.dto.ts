import { IsOptional, IsUUID, IsIn, IsDateString, Matches } from 'class-validator';

export class UpdateJadwalDto {
  @IsOptional()
  @IsUUID()
  guruId?: string;

  @IsOptional()
  @IsUUID()
  mataPelajaranId?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'jamMulai must be in HH:mm format',
  })
  jamMulai?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'jamSelesai must be in HH:mm format',
  })
  jamSelesai?: string;

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
