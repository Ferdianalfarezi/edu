export { CreateBarangDto } from './create-barang.dto';
export { UpdateBarangDto } from './update-barang.dto';
export { ListBarangQueryDto } from './list-barang-query.dto';
export type { KondisiBarang, SumberDana, KategoriBarang } from '@/drizzle/schema/barang';

export interface BarangResponseDto {
  id: string;
  nama: string;
  deskripsi: string | null;
  jumlah: number;
  lokasi: string | null;
  kondisi_barang: string | null;
  sumber_dana: string | null;
  kategori: string | null;
  createdAt: string;
  updatedAt: string;
}
