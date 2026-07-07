import { IsArray, IsNotEmpty, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class CatatanItem {
  @IsUUID()
  @IsNotEmpty()
  siswa_id: string;

  @IsString()
  @IsOptional()
  catatan?: string;
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
