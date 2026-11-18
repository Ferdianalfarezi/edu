import {
  IsNotEmpty,
  IsUUID,
  IsInt,
  IsIn,
  IsDateString,
  IsOptional,
  IsBoolean,
  Min,
  Max,
  ValidateIf,
} from 'class-validator';

export class CreateJadwalDto {
  @IsNotEmpty()
  @IsUUID()
  kelasId: string;

  @ValidateIf((o) => !o.isIstirahat)
  @IsNotEmpty({ message: 'mataPelajaranId wajib diisi untuk jam pelajaran' })
  @IsUUID()
  mataPelajaranId?: string;

  @ValidateIf((o) => !o.isIstirahat)
  @IsNotEmpty({ message: 'guruId wajib diisi untuk jam pelajaran' })
  @IsUUID()
  guruId?: string;

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
  @IsInt()
  @Min(1)
  @Max(10)
  jamKe: number;

  /** Opsional. Kalau kosong diisi dari tanggal semester di tahun ajaran. */
  @IsOptional()
  @IsDateString()
  tanggalMulaiBerlaku?: string;

  /** Opsional. Kalau kosong diisi dari tanggal semester di tahun ajaran. */
  @IsOptional()
  @IsDateString()
  tanggalSelesaiBerlaku?: string;

  @IsOptional()
  @IsBoolean()
  isIstirahat?: boolean;
}
