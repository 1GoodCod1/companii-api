import { ChangePasswordUseCase } from './change-password.use-case';
import { ForgotPasswordUseCase } from './forgot-password.use-case';
import { GetMeUseCase } from './get-me.use-case';
import { LoginUseCase } from './login.use-case';
import { LogoutAllUseCase } from './logout-all.use-case';
import { LogoutUseCase } from './logout.use-case';
import { RefreshCompanyContextUseCase } from './refresh-company-context.use-case';
import { RefreshTokensUseCase } from './refresh-tokens.use-case';
import { RegisterUseCase } from './register.use-case';
import { ResetPasswordUseCase } from './reset-password.use-case';
import { SwitchCompanyUseCase } from './switch-company.use-case';

export const AUTH_USE_CASE_PROVIDERS = [
  RegisterUseCase,
  LoginUseCase,
  RefreshTokensUseCase,
  RefreshCompanyContextUseCase,
  SwitchCompanyUseCase,
  LogoutUseCase,
  LogoutAllUseCase,
  GetMeUseCase,
  ForgotPasswordUseCase,
  ResetPasswordUseCase,
  ChangePasswordUseCase,
];
