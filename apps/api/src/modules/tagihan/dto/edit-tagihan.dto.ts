import { IsNotEmpty, IsNumber, Min } from 'class-validator';

/**
 * DTO for PATCH /tagihan/:id — edit nominal only if status belum_bayar.
 *
 * Requirements: 34.3, 34.4
 */
export class EditTagihanDto {
  @IsNumber({}, { message: 'nominal harus berupa angka' })
  @IsNotEmpty({ message: 'nominal wajib diisi' })
  @Min(1, { message: 'nominal harus lebih dari 0' })
  nominal: number;
}
