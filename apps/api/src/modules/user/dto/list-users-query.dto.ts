import { IsEnum, IsOptional, IsString, IsIn } from 'class-validator';
import { Role } from '@edu/shared';

export class ListUsersQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsEnum([Role.ADMIN, Role.KEPALA_SEKOLAH, Role.GURU, Role.BENDAHARA])
  role?: Role;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['true', 'false', 'all'])
  is_active?: 'true' | 'false' | 'all';
}
