import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

/**
 * DTO for POST /tagihan/:id/manual-payment.
 * Used by bendahara to record tunai/transfer_manual payments.
 *
 * Requirements: 13.1, 13.5, 13.7
 */
export class ManualPaymentDto {
  @IsNumber({}, { message: 'jumlah_bayar harus berupa angka' })
  @IsNotEmpty({ message: 'jumlah_bayar wajib diisi' })
  @Min(1, { message: 'jumlah_bayar harus lebih dari 0' })
  jumlah_bayar: number;

  @IsEnum(['tunai', 'transfer_manual'], {
    message: 'metode harus berupa tunai atau transfer_manual',
  })
  @IsNotEmpty({ message: 'metode wajib diisi' })
  metode: 'tunai' | 'transfer_manual';

  @IsOptional()
  @IsString({ message: 'catatan harus berupa string' })
  catatan?: string;
}
