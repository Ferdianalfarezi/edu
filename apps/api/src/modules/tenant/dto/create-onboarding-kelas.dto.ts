import { IsString, IsNotEmpty, IsInt, Min, Max } from 'class-validator';

export class CreateOnboardingKelasDto {
  @IsString()
  @IsNotEmpty()
  nama: string;

  @IsInt()
  @Min(1)
  @Max(12)
  tingkat: number;
}
