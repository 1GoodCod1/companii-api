import { applyDecorators } from '@nestjs/common';
import {
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export function IsStrongPassword() {
  return applyDecorators(
    IsString(),
    MinLength(10, { message: 'Password must be at least 10 characters' }),
    MaxLength(128, { message: 'Password is too long (max 128)' }),
    Matches(/[a-z]/, { message: 'Password must contain a lowercase letter' }),
    Matches(/[A-Z]/, { message: 'Password must contain an uppercase letter' }),
    Matches(/\d/, { message: 'Password must contain a digit' }),
  );
}
