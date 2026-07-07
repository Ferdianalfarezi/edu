import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsUUID,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * A single attendance record from the mobile offline queue.
 * event_timestamp = when teacher pressed "save" on device (NOT sync-time).
 */
export class SyncAbsensiRecordDto {
  @IsUUID()
  @IsNotEmpty()
  siswa_id: string;

  @IsUUID()
  @IsNotEmpty()
  kelas_id: string;

  @IsDateString()
  @IsNotEmpty()
  tanggal: string;

  @IsEnum(['hadir', 'izin', 'sakit', 'alpa'], {
    message: 'status harus salah satu dari: hadir, izin, sakit, alpa',
  })
  @IsNotEmpty()
  status: 'hadir' | 'izin' | 'sakit' | 'alpa';

  @IsDateString()
  @IsNotEmpty()
  event_timestamp: string;
}

/**
 * POST /absensi/sync — batch offline sync from mobile app.
 *
 * Requirements: 26.1–26.6
 */
export class SyncAbsensiDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SyncAbsensiRecordDto)
  records: SyncAbsensiRecordDto[];
}

/**
 * Response types for sync result
 */
export interface SyncConflictResult {
  siswa_id: string;
  tanggal: string;
  winner: 'server' | 'client';
  reason: string;
  server_value?: string;
}

export interface SyncRejectedResult {
  siswa_id: string;
  tanggal: string;
  reason: string;
}

export interface SyncAbsensiResponse {
  synced: string[];
  conflicts: SyncConflictResult[];
  rejected: SyncRejectedResult[];
}
