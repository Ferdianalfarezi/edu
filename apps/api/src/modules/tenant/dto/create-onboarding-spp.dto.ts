import { IsInt, Min, Max } from 'class-validator';

export class CreateOnboardingSppDto {
  @IsInt()
  @Min(1)
  @Max(13)
  tingkat: number;

  @IsInt()
  @Min(1)
  nominal: number;
}
