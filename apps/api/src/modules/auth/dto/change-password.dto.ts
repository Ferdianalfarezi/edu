import {
  IsNotEmpty,
  IsString,
  MinLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

@ValidatorConstraint({ name: 'notSameAsOld', async: false })
class NotSameAsOldConstraint implements ValidatorConstraintInterface {
  validate(newPassword: string, args: ValidationArguments) {
    const obj = args.object as ChangePasswordDto;
    return newPassword !== obj.old_password;
  }

  defaultMessage() {
    return 'Password baru tidak boleh sama dengan password lama';
  }
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  old_password: string;

  @IsString()
  @MinLength(6)
  @Validate(NotSameAsOldConstraint)
  new_password: string;
}
