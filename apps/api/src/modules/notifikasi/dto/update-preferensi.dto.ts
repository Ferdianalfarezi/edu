import { IsBoolean, IsUUID } from 'class-validator';

/**
 * DTO for updating notification preferences per child.
 *
 * Requirements: 25.1–25.4
 */
export class UpdatePreferensiDto {
  @IsUUID()
  anak_id: string;

  @IsBoolean()
  kehadiran_enabled: boolean;

  @IsBoolean()
  ketidakhadiran_enabled: boolean;
}
