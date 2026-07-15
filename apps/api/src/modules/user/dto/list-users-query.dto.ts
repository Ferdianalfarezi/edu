import { IsInt, IsOptional, IsString, IsIn, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { Role } from '@edu/shared';

export class ListUsersQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsIn([Role.ADMIN, Role.KEPALA_SEKOLAH, Role.GURU, Role.BENDAHARA])
  role?: Role;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['true', 'false', 'all'])
  is_active?: 'true' | 'false' | 'all';

  /** Used by SUPER_ADMIN cross-tenant listing */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  /** Used by SUPER_ADMIN cross-tenant listing */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page_size?: number;
}
