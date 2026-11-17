import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class ExportRekapAbsensiQueryDto {
  @IsUUID()
  kelas_id: string;

  @Transform(({ value }) => (value !== undefined ? parseInt(value, 10) : undefined))
  @IsInt()
  @Min(1)
  @Max(12)
  @IsOptional()
  bulan?: number;

  @Transform(({ value }) => (value !== undefined ? parseInt(value, 10) : undefined))
  @IsInt()
  @Min(2000)
  @Max(2100)
  @IsOptional()
  tahun?: number;

  @Transform(({ value }) => (value !== undefined ? parseInt(value, 10) : undefined))
  @IsInt()
  @Min(1)
  @Max(2)
  @IsOptional()
  semester?: number;

  @IsEnum(['bulanan', 'semester'], {
    message: 'periode harus salah satu dari: bulanan, semester',
  })
  @IsOptional()
  periode?: 'bulanan' | 'semester' = 'bulanan';

  @IsEnum(['xlsx'], {
    message: 'format harus: xlsx',
  })
  @IsOptional()
  format?: 'xlsx' = 'xlsx' as const;
}

export interface ExportRekapAbsensiResponse {
  job_id: string;
  message: string;
}
