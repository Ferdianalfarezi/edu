import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateBarangDto {
  @IsString()
  @IsNotEmpty({ message: 'Nama barang tidak boleh kosong' })
  @MaxLength(255, { message: 'Nama barang maksimal 255 karakter' })
  nama: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Deskripsi maksimal 1000 karakter' })
  deskripsi?: string;

  @IsInt({ message: 'Jumlah harus bilangan bulat' })
  @Min(0, { message: 'Jumlah minimal 0' })
  @Max(999999999, { message: 'Jumlah maksimal 999.999.999' })
  jumlah: number;
}
