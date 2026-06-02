import { join } from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import type { Response } from 'express';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import configuration from './config';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard';
import { CookieOriginGuard } from './common/guards/cookie-origin.guard';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { CacheControlInterceptor } from './common/interceptors/cache-control.interceptor';
import { SlowRequestInterceptor } from './common/interceptors/slow-request.interceptor';
import { TimeoutInterceptor } from './common/interceptors/timeout.interceptor';
import { AuditModule } from './modules/audit/audit.module';
import { PrismaModule } from './modules/shared/database/prisma.module';
import { RedisModule } from './modules/shared/redis/redis.module';
import { CacheModule } from './modules/shared/cache/cache.module';
import { QueueModule } from './modules/shared/queue';
import { MaintenanceModule } from './modules/shared/maintenance/maintenance.module';
import { FilesModule } from './modules/files/files.module';
import { EmailModule } from './modules/email/email.module';
import { AuthModule } from './modules/auth/auth.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { FsmModule } from './modules/fsm/fsm.module';
import { PortalModule } from './modules/portal/portal.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { AdminModule } from './modules/admin/admin.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ConsentModule } from './modules/consent/consent.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { EstimatesModule } from './modules/estimates/estimates.module';
import { SeoModule } from './modules/seo/seo.module';
import { WebVitalsModule } from './modules/web-vitals/web-vitals.module';
import { RlsModule } from './common/rls/rls.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { AUTH_THROTTLER_NAME } from './common/constants';
import { EventEmitterModule } from '@nestjs/event-emitter';

const isProd = process.env.NODE_ENV === 'production';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ...(isProd
      ? []
      : [
          ServeStaticModule.forRoot({
            rootPath: join(process.cwd(), 'uploads'),
            serveRoot: '/uploads',
            serveStaticOptions: {
              fallthrough: true,
              setHeaders: (res: Response) => {
                res.setHeader(
                  'Cache-Control',
                  'public, max-age=86400, stale-while-revalidate=3600',
                );
                res.setHeader('X-Content-Type-Options', 'nosniff');
              },
            },
          }),
        ]),
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 120 },
      { name: AUTH_THROTTLER_NAME, ttl: 60_000, limit: 20 },
    ]),
    EventEmitterModule.forRoot(),
    PrismaModule,
    RlsModule,
    RedisModule,
    CacheModule,
    QueueModule,
    MaintenanceModule,
    FilesModule,
    EmailModule,
    AuditModule,
    AuthModule,
    CompaniesModule,
    FsmModule,
    PortalModule,
    SubscriptionsModule,
    AdminModule,
    PaymentsModule,
    ConsentModule,
    ReviewsModule,
    EstimatesModule,
    SeoModule,
    WebVitalsModule,
  ],
  controllers: [HealthController],
  providers: [
    HealthService,
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: CookieOriginGuard },
    {
      provide: APP_INTERCEPTOR,
      useFactory: () => new TimeoutInterceptor(30_000),
    },
    { provide: APP_INTERCEPTOR, useClass: CacheControlInterceptor },
    { provide: APP_INTERCEPTOR, useClass: SlowRequestInterceptor },
  ],
})
export class AppModule {}
