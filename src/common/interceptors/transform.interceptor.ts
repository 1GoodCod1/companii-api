import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type { Request } from 'express';
import { getRequestId } from '../request-context';
import { isStreamingHandler } from '../decorators/streaming.decorator';

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

    // SSE/streaming handlers emit raw MessageEvent frames — wrapping each one in
    // the JSON success envelope would corrupt the event stream.
    if (isStreamingHandler(context.getHandler())) {
      return next.handle() as Observable<ApiSuccessResponse<T>>;
    }

    if (request.url === '/health' || request.url.startsWith('/metrics')) {
      return next.handle() as Observable<ApiSuccessResponse<T>>;
    }

    return next.handle().pipe(
      map((data: T) => {
        if (
          data instanceof StreamableFile ||
          isNodeReadable(data) ||
          Buffer.isBuffer(data)
        ) {
          return data as unknown as ApiSuccessResponse<T>;
        }
        return {
          success: true as const,
          data,
          timestamp: new Date().toISOString(),
          path: request.url,
          ...(requestId ? { requestId } : {}),
        };
      }),
    );
  }
}

function isNodeReadable(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { pipe?: unknown }).pipe === 'function'
  );
}
