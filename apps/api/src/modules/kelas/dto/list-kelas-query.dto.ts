import { IsOptional, IsString, IsUUID } from 'class-validator';

export class ListKelasQueryDto {
  @IsOptional()
  @IsUUID()
  tahunAjaranId?: string;

  @IsOptional()
  @IsString()
  cursor?: string;
}
