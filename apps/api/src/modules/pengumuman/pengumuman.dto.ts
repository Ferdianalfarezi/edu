import {
  IsString,
  MinLength,
  MaxLength,
  IsEnum,
  IsOptional,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  IsUUID,
  ValidateIf,
  IsIn,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '../../common/dto';

const PENGUMUMAN_MODE_VALUES = ['broadcast', 'targeted'] as const;
type PengumumanMode = (typeof PENGUMUMAN_MODE_VALUES)[number];

export class CreatePengumumanDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  judul: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  deskripsi: string;

  @IsEnum(PENGUMUMAN_MODE_VALUES, {
    message: 'Mode harus salah satu dari: broadcast, targeted',
  })
  mode: PengumumanMode;

  @ValidateIf((o) => o.mode === 'targeted')
  @IsArray({ message: 'siswa_ids harus berupa array' })
  @ArrayMinSize(1, { message: 'Minimal satu siswa harus dipilih' })
  @ArrayMaxSize(100, { message: 'Maksimal 100 siswa dapat dipilih' })
  @IsUUID('4', { each: true, message: 'Setiap siswa_id harus berupa UUID valid' })
  siswa_ids?: string[];
}

const ALLOWED_PAGE_SIZES = [10, 15, 25, 50] as const;

export class ListPengumumanQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  override page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(ALLOWED_PAGE_SIZES, {
    message: `page_size harus salah satu dari: ${ALLOWED_PAGE_SIZES.join(', ')}`,
  })
  override page_size: number = 15;
}
