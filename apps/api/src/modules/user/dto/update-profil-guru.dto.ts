import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PENDIDIKAN_TERAKHIR } from '@/drizzle/schema/guru-profil';

/**
 * Lengkapi / ubah data guru dari halaman Guru.
 * Field yang tidak dikirim tidak berubah; string kosong = dikosongkan.
 */
export class UpdateProfilGuruDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  telepon?: string;

  /** NUPTK atau NIP (opsional, guru honorer sering belum punya) */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  nomorInduk?: string;

  @IsOptional()
  @IsIn(['', ...PENDIDIKAN_TERAKHIR], {
    message: `Pendidikan terakhir harus salah satu dari: ${PENDIDIKAN_TERAKHIR.join(', ')}`,
  })
  pendidikanTerakhir?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  kampus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  alamat?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Tanggal lahir tidak valid' })
  tanggalLahir?: string;
}
