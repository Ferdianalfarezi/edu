import { IsDateString } from 'class-validator';

/**
 * Query GET /jadwal/saya/rentang: jadwal guru per tanggal dalam satu rentang (maks 62 hari).
 */
export class JadwalSayaRentangDto {
  @IsDateString()
  mulai: string;

  @IsDateString()
  selesai: string;
}
