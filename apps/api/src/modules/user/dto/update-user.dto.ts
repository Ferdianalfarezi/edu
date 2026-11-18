import { IsEmail, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { Role } from '@edu/shared';

const UPDATABLE_ROLES = [Role.ADMIN, Role.KEPALA_SEKOLAH, Role.GURU, Role.BENDAHARA] as const;

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  nama?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(UPDATABLE_ROLES, {
    message: `Role must be one of: ${UPDATABLE_ROLES.join(', ')}`,
  })
  role?: (typeof UPDATABLE_ROLES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}
