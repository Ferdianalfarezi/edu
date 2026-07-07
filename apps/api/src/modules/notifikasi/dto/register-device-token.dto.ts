import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RegisterDeviceTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  fcm_token: string;

  @IsEnum(['android', 'ios'])
  platform: 'android' | 'ios';
}
