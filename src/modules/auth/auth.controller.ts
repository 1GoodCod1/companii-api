import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import {
  AUTH_LOGIN_THROTTLE_LIMIT,
  AUTH_LOGIN_THROTTLE_TTL_MS,
  AUTH_THROTTLER_NAME,
  CONTROLLER_PATH,
} from '../../common/constants';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { RefreshCookieService } from './services/refresh-cookie.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import type { JwtPayload } from './types/jwt-payload';

@Controller(CONTROLLER_PATH.auth)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly refreshCookie: RefreshCookieService,
  ) {}

  @Public()
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.register(dto);
    return this.refreshCookie.handleAuthSuccess(result, res);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    [AUTH_THROTTLER_NAME]: {
      limit: AUTH_LOGIN_THROTTLE_LIMIT,
      ttl: AUTH_LOGIN_THROTTLE_TTL_MS,
    },
  })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto, req);
    return this.refreshCookie.handleAuthSuccess(result, res);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.refreshCookie.handleLogout(
      req,
      res,
      dto.refreshToken,
      (token) => this.auth.logout(token),
    );
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.refreshCookie.clearIfEnabled(res);
    return this.auth.logoutAll(user.sub);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const token = this.refreshCookie.getTokenOrThrow(req, dto.refreshToken);
      const result = await this.auth.refresh(token);
      return this.refreshCookie.handleAuthSuccess(result, res);
    } catch (err) {
      this.refreshCookie.clearIfEnabled(res);
      throw err;
    }
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 2, ttl: 300_000 } })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.auth.changePassword(user.sub, dto);
  }

  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return this.auth.me(user.sub);
  }
}
