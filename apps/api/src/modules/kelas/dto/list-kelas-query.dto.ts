import { IsOptional, IsString, IsUUID } from 'class-validator';

export class ListKelasQueryDto {
  @IsOptional()
  @IsUUID()
  tahunAjaranId?: string;

  /** Alias: accept snake_case from query params */
  @IsOptional()
  @IsUUID()
  tahun_ajaran_id?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  /** Resolved tahunAjaranId — prefers camelCase, falls back to snake_case */
  get resolvedTahunAjaranId(): string | undefined {
    return this.tahunAjaranId || this.tahun_ajaran_id;
  }
}
