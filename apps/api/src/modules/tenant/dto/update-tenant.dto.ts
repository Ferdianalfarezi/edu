import { IsString, IsOptional, IsEmail, MaxLength } from 'class-validator';

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
}
