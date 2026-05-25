import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { applyGlobalPrefix } from '../../src/config/http-app';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../../src/common/interceptors';

export function applyE2eAppConfig(app: INestApplication): void {
  applyGlobalPrefix(app);
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter(app.get(ConfigService)));
  app.useGlobalInterceptors(new TransformInterceptor());
}

export function api(path: string): string {
  return `/api/v1${path.startsWith('/') ? path : `/${path}`}`;
}

export function unwrapBody<T>(body: unknown): T {
  if (body && typeof body === 'object' && 'data' in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}
