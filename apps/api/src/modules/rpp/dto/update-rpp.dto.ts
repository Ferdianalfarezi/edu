import { IsString, IsUUID, IsInt, IsIn, IsOptional, MaxLength, Min } from 'class-validator';

/**
 * DTO for updating an existing RPP / Modul Ajar.
 * All fields optional — only provided fields will be updated.
 * Can also be used with multipart/form-data if replacing file.
 *
 * Requirements: 42.1, 42.2, 42.3
 */
export class UpdateRppDto {
  @IsOptional()
  @IsString({ message: 'judul wajib berupa string' })
  @MaxLength(255, { message: 'judul maksimal 255 karakter' })
  judul?: string;

  @IsOptional()
  @IsUUID('4', { message: 'mata_pelajaran_id harus berupa UUID' })
  mata_pelajaran_id?: string;

  @IsOptional()
  @IsString({ message: 'kategori wajib berupa string' })
  @MaxLength(100, { message: 'kategori maksimal 100 karakter' })
  kategori?: string;

  @IsOptional()
  @IsInt({ message: 'tahun_terbit harus berupa angka' })
  @Min(2000, { message: 'tahun_terbit minimal 2000' })
  tahun_terbit?: number;

  @IsOptional()
  @IsIn(['richtext', 'file'], { message: 'konten_type harus richtext atau file' })
  konten_type?: 'richtext' | 'file';

  @IsOptional()
  @IsString()
  konten?: string;

  @IsOptional()
  @IsIn(['draft', 'published'], { message: 'status harus draft atau published' })
  status?: 'draft' | 'published';
}
