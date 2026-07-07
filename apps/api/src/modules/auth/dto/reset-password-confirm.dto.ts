import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ResetPasswordConfirmDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @MinLength(6)
  new_password: string;
}
