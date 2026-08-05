import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  kondisiBarangEnum,
  sumberDanaEnum,
  kategoriBarangEnum,
  KondisiBarang,
  SumberDana,
  KategoriBarang,
} from '@/drizzle/schema/barang';

export class UpdateBarangDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Nama barang tidak boleh kosong' })
  @MaxLength(255, { message: 'Nama barang maksimal 255 karakter' })
  nama?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Deskripsi maksimal 1000 karakter' })
  deskripsi?: string;

  @IsOptional()
  @IsInt({ message: 'Jumlah harus bilangan bulat' })
  @Min(0, { message: 'Jumlah minimal 0' })
  @Max(999999999, { message: 'Jumlah maksimal 999.999.999' })
  jumlah?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Lokasi maksimal 255 karakter' })
  lokasi?: string;

  @IsOptional()
  @IsEnum(kondisiBarangEnum.enumValues, {
    message: 'Kondisi barang harus salah satu dari: bagus, perlu_perbaikan, rusak',
  })
  kondisi_barang?: KondisiBarang;

  @IsOptional()
  @IsEnum(sumberDanaEnum.enumValues, {
    message: 'Sumber dana harus salah satu dari: yayasan, unit_sekolah, bos',
  })
  sumber_dana?: SumberDana;

  @IsOptional()
  @IsEnum(kategoriBarangEnum.enumValues, {
    message: 'Kategori harus salah satu dari: peralatan, perlengkapan',
  })
  kategori?: KategoriBarang;
}
