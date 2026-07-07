import { IsNotEmpty } from 'class-validator';

/**
 * DTO for upserting a configuration value.
 * The key comes from the URL param, value is the body.
 */
export class UpsertKonfigurasiDto {
  @IsNotEmpty({ message: 'Value tidak boleh kosong' })
  value: any;
}
