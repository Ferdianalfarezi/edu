import { IsNotEmpty, IsString } from 'class-validator';

/**
 * DTO for PATCH /tagihan/:id/cancel — cancel tagihan with required alasan.
 *
 * Requirements: 34.5, 34.6
 */
export class CancelTagihanDto {
  @IsString({ message: 'alasan harus berupa string' })
  @IsNotEmpty({ message: 'alasan pembatalan wajib diisi' })
  alasan: string;
}
