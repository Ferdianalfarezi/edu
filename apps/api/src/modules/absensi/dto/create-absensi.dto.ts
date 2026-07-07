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

export class AbsensiRecordDto {
  @IsUUID()
  @IsNotEmpty()
  siswa_id: string;

  @IsEnum(['hadir', 'izin', 'sakit', 'alpa'], {
    message: 'status harus salah satu dari: hadir, izin, sakit, alpa',
  })
  @IsNotEmpty()
  status: 'hadir' | 'izin' | 'sakit' | 'alpa';
}

export class CreateAbsensiDto {
  @IsDateString()
  @IsNotEmpty()
  tanggal: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AbsensiRecordDto)
  records: AbsensiRecordDto[];
}
