import { IsEnum, IsNotEmpty } from 'class-validator';
import { Role } from '@edu/shared';

/**
 * Roles that can be assigned by SUPER_ADMIN.
 * SUPER_ADMIN role is explicitly excluded from assignment.
 */
const ASSIGNABLE_ROLES = [
  Role.ADMIN,
  Role.KEPALA_SEKOLAH,
  Role.GURU,
  Role.BENDAHARA,
  Role.ORANG_TUA,
] as const;

export class UpdateUserRoleDto {
  @IsNotEmpty()
  @IsEnum(ASSIGNABLE_ROLES, {
    message: `Role must be one of: ${ASSIGNABLE_ROLES.join(', ')}`,
  })
  role: (typeof ASSIGNABLE_ROLES)[number];
}
