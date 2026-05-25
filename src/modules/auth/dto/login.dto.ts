import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MinLength(3)
  login!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsBoolean()
  @IsOptional()
  rememberMe?: boolean;
}
