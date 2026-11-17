import { IsString, IsOptional, IsEmail, IsIn, MaxLength } from 'class-validator';

export class UpdateTenantDto {
  @IsString()
  @IsOptional()
  @MaxLength(255)
  nama?: string;

  @IsString()
  @IsOptional()
  alamat?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  telepon?: string;

  @IsEmail()
  @IsOptional()
  @MaxLength(255)
  email?: string;

  /** Jenjang hanya bisa diganti antar jenjang dengan jumlah tingkat sama (SMP ↔ SMA) */
  @IsOptional()
  @IsIn(['sd', 'smp', 'sma'], { message: 'jenjang harus sd, smp, atau sma' })
  jenjang?: 'sd' | 'smp' | 'sma';
}
