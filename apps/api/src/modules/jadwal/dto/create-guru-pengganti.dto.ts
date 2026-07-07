import { IsNotEmpty, IsUUID, IsDateString } from 'class-validator';

/**
 * DTO for assigning a substitute teacher (guru pengganti).
 * Admin assigns a guru to cover a specific class + subject on a given date.
 *
 * Requirements: 28.1
 */
export class CreateGuruPenggantiDto {
  @IsNotEmpty()
  @IsUUID()
  guruPenggantiId: string;

  @IsNotEmpty()
  @IsUUID()
  kelasId: string;

  @IsNotEmpty()
  @IsUUID()
  mataPelajaranId: string;

  @IsNotEmpty()
  @IsDateString()
  tanggal: string;
}
