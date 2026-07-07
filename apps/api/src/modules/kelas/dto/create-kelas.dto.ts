import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateKelasDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  nama: string;

  @IsInt()
  @Min(1)
  tingkat: number;

  @IsUUID()
  tahunAjaranId: string;

  @IsOptional()
  @IsUUID()
  waliKelasId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  kapasitas?: number;
}
