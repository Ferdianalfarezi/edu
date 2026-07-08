import { IsEmail, IsEnum, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';
import { Platform } from '@edu/shared';

export class LoginDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @ValidateIf((o) => o.email != null)
  @IsString()
  @MinLength(6)
  password?: string;

  @ValidateIf((o) => !o.email)
  @IsString()
  phone?: string;

  @IsEnum(Platform)
  platform: 'admin_panel' | 'mobile';
}
