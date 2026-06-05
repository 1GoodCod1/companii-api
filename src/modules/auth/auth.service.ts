import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RegisterUseCase } from './use-cases/register.use-case';
import { LoginUseCase } from './use-cases/login.use-case';
import { RefreshTokensUseCase } from './use-cases/refresh-tokens.use-case';
import { RefreshCompanyContextUseCase } from './use-cases/refresh-company-context.use-case';
import { SwitchCompanyUseCase } from './use-cases/switch-company.use-case';
import { LogoutUseCase } from './use-cases/logout.use-case';
import { LogoutAllUseCase } from './use-cases/logout-all.use-case';
import { GetMeUseCase } from './use-cases/get-me.use-case';
import { ForgotPasswordUseCase } from './use-cases/forgot-password.use-case';
import { ResetPasswordUseCase } from './use-cases/reset-password.use-case';
import { ChangePasswordUseCase } from './use-cases/change-password.use-case';
import { EmailVerificationService } from './services/email-verification.service';
import type { JwtPayload } from './types/jwt-payload';

@Injectable()
export class AuthService {
  constructor(
    private readonly registerUc: RegisterUseCase,
    private readonly loginUc: LoginUseCase,
    private readonly refreshTokensUc: RefreshTokensUseCase,
    private readonly refreshCompanyContextUc: RefreshCompanyContextUseCase,
    private readonly switchCompanyUc: SwitchCompanyUseCase,
    private readonly logoutUc: LogoutUseCase,
    private readonly logoutAllUc: LogoutAllUseCase,
    private readonly getMeUc: GetMeUseCase,
    private readonly forgotPasswordUc: ForgotPasswordUseCase,
    private readonly resetPasswordUc: ResetPasswordUseCase,
    private readonly changePasswordUc: ChangePasswordUseCase,
    private readonly emailVerification: EmailVerificationService,
  ) {}

  register(dto: RegisterDto, rememberMe?: boolean) {
    return this.registerUc.execute(dto, rememberMe);
  }

  login(dto: LoginDto, req?: Request) {
    return this.loginUc.execute(dto, req);
  }

  refresh(refreshToken: string) {
    return this.refreshTokensUc.execute(refreshToken);
  }

  refreshCompanyContext(userId: string) {
    return this.refreshCompanyContextUc.execute(userId);
  }

  switchCompany(userId: string, companyId: string) {
    return this.switchCompanyUc.execute(userId, companyId);
  }

  logout(refreshToken: string) {
    return this.logoutUc.execute(refreshToken);
  }

  logoutAll(userId: string) {
    return this.logoutAllUc.execute(userId);
  }

  me(userId: string) {
    return this.getMeUc.execute(userId);
  }

  forgotPassword(dto: ForgotPasswordDto) {
    return this.forgotPasswordUc.execute(dto);
  }

  resetPassword(dto: ResetPasswordDto) {
    return this.resetPasswordUc.execute(dto);
  }

  changePassword(
    user: JwtPayload,
    dto: ChangePasswordDto,
    currentRefreshToken?: string,
  ) {
    return this.changePasswordUc.execute(user, dto, currentRefreshToken);
  }

  verifyEmail(token: string) {
    return this.emailVerification.verify(token);
  }

  resendEmailVerification(userId: string) {
    return this.emailVerification.resend(userId);
  }
}
