import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type { Request } from 'express';
import { getRequestId } from '../request-context';

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  timestamp: string;
  path: string;
  requestId?: string;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  ApiSuccessResponse<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiSuccessResponse<T>> {
    const request = context.switchToHttp().getRequest<Request>();
    const requestId = getRequestId();

    if (request.url === '/health' || request.url.startsWith('/metrics')) {
      return next.handle() as Observable<ApiSuccessResponse<T>>;
    }

    return next.handle().pipe(
      map((data: T) => ({
        success: true as const,
        data,
        timestamp: new Date().toISOString(),
        path: request.url,
        ...(requestId ? { requestId } : {}),
      })),
    );
  }
}
