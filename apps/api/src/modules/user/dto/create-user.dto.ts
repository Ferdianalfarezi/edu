import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Role } from '@edu/shared';

/**
 * Roles that an admin can create within their tenant.
 * orang_tua is handled via siswa onboarding, super_admin is out of scope.
 */
const CREATABLE_ROLES = [Role.ADMIN, Role.KEPALA_SEKOLAH, Role.GURU, Role.BENDAHARA] as const;

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  nama: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsEnum(CREATABLE_ROLES, {
    message: `Role must be one of: ${CREATABLE_ROLES.join(', ')}`,
  })
  role: (typeof CREATABLE_ROLES)[number];
}
