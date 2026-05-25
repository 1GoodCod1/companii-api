import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import type { Request } from 'express';
import { stripApiPrefix } from '../utils/api-route.util';

@Injectable()
export class CacheControlInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<{
      setHeader: (name: string, value: string) => void;
    }>();

    if (request.method === 'GET') {
      const path = stripApiPrefix(request.path);
      const isProd = process.env.NODE_ENV === 'production';

      if (
        path === '/companies' ||
        path.startsWith('/companies/') ||
        path === '/packages' ||
        path === '/subscriptions/plans'
      ) {
        response.setHeader(
          'Cache-Control',
          isProd
            ? 'public, max-age=120, stale-while-revalidate=300'
            : 'private, no-cache, must-revalidate',
        );
      }
    }

    return next.handle();
  }
}
