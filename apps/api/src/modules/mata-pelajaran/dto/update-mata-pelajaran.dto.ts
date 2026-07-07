import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateMataPelajaranDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nama?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  kode?: string;
}
