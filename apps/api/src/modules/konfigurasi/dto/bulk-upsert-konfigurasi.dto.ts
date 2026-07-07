import { IsArray, IsNotEmpty, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class KonfigurasiItemDto {
  @IsNotEmpty({ message: 'Key tidak boleh kosong' })
  key: string;

  @IsNotEmpty({ message: 'Value tidak boleh kosong' })
  value: any;
}

/**
 * DTO for bulk upserting multiple config keys at once.
 * Body: { items: [{ key: "...", value: ... }, ...] }
 */
export class BulkUpsertKonfigurasiDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => KonfigurasiItemDto)
  items: KonfigurasiItemDto[];
}
