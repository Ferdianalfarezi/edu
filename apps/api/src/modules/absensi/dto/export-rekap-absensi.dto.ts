import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class ExportRekapAbsensiQueryDto {
  @IsUUID()
  kelas_id: string;

  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(12)
  bulan: number;

  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(2000)
  @Max(2100)
  tahun: number;

  @IsEnum(['bulanan', 'semester'], {
    message: 'periode harus salah satu dari: bulanan, semester',
  })
  @IsOptional()
  periode?: 'bulanan' | 'semester' = 'bulanan';

  @IsEnum(['xlsx'], {
    message: 'format harus: xlsx',
  })
  @IsOptional()
  format?: 'xlsx' = 'xlsx';
}

export interface ExportRekapAbsensiResponse {
  job_id: string;
  message: string;
}
