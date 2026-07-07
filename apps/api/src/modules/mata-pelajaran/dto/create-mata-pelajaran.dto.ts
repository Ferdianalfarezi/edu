import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateMataPelajaranDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  nama: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  kode?: string;
}
