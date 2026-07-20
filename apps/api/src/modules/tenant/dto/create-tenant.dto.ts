import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsInt,
  IsIn,
  MaxLength,
  Min,
  Max,
} from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  nama: string;

  @IsString()
  @IsOptional()
  alamat?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  telepon?: string;

  @IsEmail()
  @IsNotEmpty()
  @MaxLength(255)
  email: string;

  /** Jumlah tingkat kelas untuk sekolah ini (e.g., 6 for SD, 3 for SMP/SMA) */
  @IsInt()
  @IsNotEmpty()
  @Min(1)
  @Max(13)
  jumlah_tingkat: number;

  /** Hari kerja sekolah: 5 hari (Senin-Jumat) atau 6 hari (Senin-Sabtu) */
  @IsOptional()
  @IsIn(['5_hari', '6_hari'], {
    message: 'hari_kerja harus bernilai 5_hari atau 6_hari',
  })
  hari_kerja?: '5_hari' | '6_hari';

  /** Name of the default admin user for this tenant */
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  admin_nama: string;

  /** Email for the default admin user (login credential) */
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(255)
  admin_email: string;
}
