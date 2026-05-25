import { AccountKind } from '@prisma/client';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsEnum(AccountKind)
  accountKind!: AccountKind;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @ValidateIf((dto: RegisterDto) => dto.accountKind === 'END_CLIENT' && !dto.portalInviteToken)
  @IsString()
  @MinLength(8)
  phone?: string;

  @IsBoolean()
  @Equals(true, { message: 'acceptTerms must be true' })
  acceptTerms!: boolean;

  @IsOptional()
  @IsString()
  portalInviteToken?: string;

  @IsOptional()
  @IsString()
  teamInviteToken?: string;
}
