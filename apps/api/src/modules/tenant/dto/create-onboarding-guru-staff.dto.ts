import { IsString, IsNotEmpty, IsOptional, IsEmail, IsIn, MaxLength } from 'class-validator';

export class CreateOnboardingGuruStaffDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  nama: string;

  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  telepon?: string;

  @IsIn(['admin', 'guru', 'kepala_sekolah', 'bendahara'])
  role: string;
}
