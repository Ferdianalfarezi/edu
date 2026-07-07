import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class UpdateKelasDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  nama?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  tingkat?: number;

  @IsOptional()
  @IsUUID()
  waliKelasId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  kapasitas?: number;
}
