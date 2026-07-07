import { IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for bukti transfer upload.
 * Sent as multipart/form-data alongside the image file.
 *
 * Requirements: 11.2, 11.9, 11.10
 */
export class UploadBuktiDto {
  @Type(() => Number)
  @IsNumber({}, { message: 'nominal_bayar harus berupa angka' })
  @Min(10000, { message: 'Nominal pembayaran minimal Rp 10.000' })
  nominal_bayar: number;
}
