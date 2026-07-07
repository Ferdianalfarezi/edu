import { IsString, IsUUID, IsInt, IsIn, IsOptional, MaxLength, Min } from 'class-validator';

/**
 * DTO for creating a new RPP / Modul Ajar.
 * Used with either multipart/form-data (file upload) or JSON body (rich text).
 *
 * Requirements: 41.1, 41.2, 41.5, 41.8
 */
export class CreateRppDto {
  @IsString({ message: 'judul wajib diisi' })
  @MaxLength(255, { message: 'judul maksimal 255 karakter' })
  judul: string;

  @IsUUID('4', { message: 'mata_pelajaran_id harus berupa UUID' })
  mata_pelajaran_id: string;

  @IsString({ message: 'kategori wajib diisi' })
  @MaxLength(100, { message: 'kategori maksimal 100 karakter' })
  kategori: string;

  @IsInt({ message: 'tahun_terbit harus berupa angka' })
  @Min(2000, { message: 'tahun_terbit minimal 2000' })
  tahun_terbit: number;

  @IsIn(['richtext', 'file'], { message: 'konten_type harus richtext atau file' })
  konten_type: 'richtext' | 'file';

  @IsOptional()
  @IsString()
  konten?: string;

  @IsIn(['draft', 'published'], { message: 'status harus draft atau published' })
  status: 'draft' | 'published';
}
