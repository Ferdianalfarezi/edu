import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class CreateOnboardingMataPelajaranDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nama: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  kode?: string;
}
