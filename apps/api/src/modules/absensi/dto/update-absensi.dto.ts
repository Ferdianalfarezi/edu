import { IsIn, IsNotEmpty, IsString } from 'class-validator';

/**
 * DTO for updating (editing) an attendance record's status.
 *
 * Requirements: 2.1–2.6
 */
export class UpdateAbsensiDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['hadir', 'izin', 'sakit', 'alpa'], {
    message: 'Status harus berupa: hadir, izin, sakit, atau alpa',
  })
  status: 'hadir' | 'izin' | 'sakit' | 'alpa';
}
