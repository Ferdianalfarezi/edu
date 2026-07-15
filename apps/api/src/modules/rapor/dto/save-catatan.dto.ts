import { IsArray, IsNotEmpty, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class P5DeskripsiItem {
  @IsString()
  @IsNotEmpty()
  dimensi: string;

  @IsString()
  @IsNotEmpty()
  deskripsi: string;
}

class CatatanItem {
  @IsUUID()
  @IsNotEmpty()
  siswa_id: string;

  @IsString()
  @IsOptional()
  catatan?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => P5DeskripsiItem)
  p5_deskripsi?: P5DeskripsiItem[];
}

/**
 * DTO for saving wali kelas notes (catatan) for students.
 */
export class SaveCatatanDto {
  @IsUUID()
  @IsNotEmpty()
  kelas_id: string;

  @IsString()
  @IsNotEmpty()
  periode_rapor_id: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CatatanItem)
  catatan: CatatanItem[];
}
