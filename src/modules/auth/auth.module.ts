import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuditModule } from '../audit/audit.module';
import { PortalModule } from '../portal/portal.module';
import { TeamInviteModule } from '../companies/team-invite.module';
import { EmailModule } from '../email/email.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { RefreshCookieService } from './services/refresh-cookie.service';
import { TokenService } from './services/token.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AuthLockoutService } from './services/auth-lockout.service';
import { SubscriptionGuard } from './guards/subscription.guard';

@Module({
  imports: [
    AuditModule,
    PortalModule,
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
    TokenService,
    RefreshCookieService,
    AuthLockoutService,
    JwtStrategy,
    SubscriptionGuard,
  ],
  exports: [AuthService, JwtModule, PassportModule, SubscriptionGuard, RefreshCookieService],
})
export class AuthModule {}
