import { IsEnum, IsString, ValidateIf } from 'class-validator';

/**
 * DTO for payment verification by bendahara.
 *
 * Requirements: 12.1–12.8
 */
export class VerifyPaymentDto {
  @IsEnum(['approve', 'reject'], { message: 'action harus berupa "approve" atau "reject"' })
  action: 'approve' | 'reject';

  @ValidateIf((o) => o.action === 'reject')
  @IsString({ message: 'alasan_penolakan harus berupa string' })
  alasan_penolakan?: string;
}
