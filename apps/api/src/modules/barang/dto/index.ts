export { CreateBarangDto } from './create-barang.dto';
export { UpdateBarangDto } from './update-barang.dto';
export { ListBarangQueryDto } from './list-barang-query.dto';

export interface BarangResponseDto {
  id: string;
  nama: string;
  deskripsi: string | null;
  jumlah: number;
  createdAt: string;
  updatedAt: string;
}
