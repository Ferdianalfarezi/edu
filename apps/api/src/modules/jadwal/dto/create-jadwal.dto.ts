import { IsNotEmpty, IsUUID, IsInt, IsIn, IsDateString, Matches } from 'class-validator';

export class CreateJadwalDto {
  @IsNotEmpty()
  @IsUUID()
  kelasId: string;

  @IsNotEmpty()
  @IsUUID()
  mataPelajaranId: string;

  @IsNotEmpty()
  @IsUUID()
  guruId: string;

  @IsNotEmpty()
  @IsUUID()
  tahunAjaranId: string;

  @IsNotEmpty()
  @IsInt()
  @IsIn([1, 2])
  semester: number;

  @IsNotEmpty()
  @IsIn(['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'])
  hari: string;

  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'jamMulai must be in HH:mm format',
  })
  jamMulai: string;

  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'jamSelesai must be in HH:mm format',
  })
  jamSelesai: string;

  @IsNotEmpty()
  @IsDateString()
  tanggalMulaiBerlaku: string;

  @IsNotEmpty()
  @IsDateString()
  tanggalSelesaiBerlaku: string;
}
