import { IsEnum, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import {
  kondisiBarangEnum,
  sumberDanaEnum,
  kategoriBarangEnum,
  KondisiBarang,
  SumberDana,
  KategoriBarang,
} from '@/drizzle/schema/barang';

export class ListBarangQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([10, 15, 25, 50])
  page_size?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(kondisiBarangEnum.enumValues, {
    message: 'kondisi_barang harus salah satu dari: bagus, perlu_perbaikan, rusak',
  })
  kondisi_barang?: KondisiBarang;

  @IsOptional()
  @IsEnum(sumberDanaEnum.enumValues, {
    message: 'sumber_dana harus salah satu dari: yayasan, unit_sekolah, bos',
  })
  sumber_dana?: SumberDana;

  @IsOptional()
  @IsEnum(kategoriBarangEnum.enumValues, {
    message: 'kategori harus salah satu dari: peralatan, perlengkapan',
  })
  kategori?: KategoriBarang;
}
