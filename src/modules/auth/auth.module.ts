import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuditModule } from '../audit/audit.module';
import { EndClientLinkModule } from '../end-client-link/end-client-link.module';
import { TeamInviteModule } from '../companies/team/team-invite.module';
import { EmailModule } from '../email/email.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { RefreshCookieService } from './services/refresh-cookie.service';
import { TokenService } from './services/token.service';
import { EmailVerificationService } from './services/email-verification.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AuthLockoutService } from './services/auth-lockout.service';
import { AuthJwtPayloadService } from './services/auth-jwt-payload.service';
import { AuthSessionService } from './services/auth-session.service';
import { AuthUserLookupService } from './services/auth-user-lookup.service';
import { SubscriptionGuard } from './guards/subscription.guard';
import { AUTH_USE_CASE_PROVIDERS } from './use-cases/auth-use-cases.providers';

@Module({
  imports: [
    AuditModule,
    EndClientLinkModule,
    TeamInviteModule,
    EmailModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('jwt.secret'),
        signOptions: { expiresIn: config.get('jwt.expiresIn') },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthJwtPayloadService,
    AuthSessionService,
    AuthUserLookupService,
    TokenService,
    RefreshCookieService,
    AuthLockoutService,
    EmailVerificationService,
    JwtStrategy,
    SubscriptionGuard,
    ...AUTH_USE_CASE_PROVIDERS,
  ],
  exports: [AuthService, RefreshCookieService],
})
export class AuthModule {}
