import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

/**
 * Tipe konfigurasi biaya — per siswa atau per kelas.
 * Harus cocok dengan enum di schema database.
 */
export enum KonfigBiayaType {
  PER_SISWA = 'per_siswa',
  PER_KELAS = 'per_kelas',
}

/**
 * DTO untuk upsert konfigurasi biaya sekolah.
 *
 * - Jika type = per_siswa: siswaId wajib diisi
 * - Jika type = per_kelas: kelasId wajib diisi
 *
 * Validasi nominal: bilangan bulat positif antara 1 dan 999.999.999.
 *
 * Requirements: 6.1, 6.2, 6.3
 */
export class UpsertKonfigBiayaDto {
  @IsEnum(KonfigBiayaType, {
    message: 'type harus berupa "per_siswa" atau "per_kelas"',
  })
  type: KonfigBiayaType;

  @IsOptional()
  @IsUUID('4', { message: 'kelasId harus berupa UUID yang valid' })
  kelasId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'siswaId harus berupa UUID yang valid' })
  siswaId?: string;

  @IsInt({ message: 'Nominal harus berupa angka bulat antara 1 dan 999.999.999.' })
  @Min(1, { message: 'Nominal harus berupa angka bulat antara 1 dan 999.999.999.' })
  @Max(999_999_999, { message: 'Nominal harus berupa angka bulat antara 1 dan 999.999.999.' })
  nominal: number;
}
