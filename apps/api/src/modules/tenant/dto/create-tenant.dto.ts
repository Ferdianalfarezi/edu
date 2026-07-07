import { IsString, IsNotEmpty, IsOptional, IsEmail, MaxLength } from 'class-validator';

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
