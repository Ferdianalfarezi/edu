import { IsNotEmpty, IsIn } from 'class-validator';

export class UpdateHariKerjaDto {
  @IsNotEmpty()
  @IsIn(['5_hari', '6_hari'], {
    message: 'hari_kerja harus bernilai 5_hari atau 6_hari',
  })
  hari_kerja: '5_hari' | '6_hari';
}
