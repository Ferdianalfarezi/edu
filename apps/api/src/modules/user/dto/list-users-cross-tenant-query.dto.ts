import { IsOptional, IsString, MinLength } from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination.dto';

export class ListUsersCrossTenantQueryDto extends PaginationQueryDto {
  page_size: number = 50;

  @IsOptional()
  @IsString()
  @MinLength(3)
  search?: string;
}
