import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

const SLOW_REQUEST_MS = parseInt(
  process.env.SLOW_REQUEST_MS ?? '800',
  10,
);

/**
 * U-11: Logs a warning when a request takes longer than SLOW_REQUEST_MS (default 800ms).
 * This complements the Prisma-level slow-query logging for end-to-end visibility.
 */
@Injectable()
export class SlowRequestInterceptor implements NestInterceptor {
  private readonly logger = new Logger('SlowRequest');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{
      method: string;
      url: string;
      user?: { sub?: string; activeCompanyId?: string };
    }>();
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const elapsed = Date.now() - start;
        if (elapsed >= SLOW_REQUEST_MS) {
          const companyId = req.user?.activeCompanyId ?? 'none';
          this.logger.warn(
            `SLOW_REQUEST ${elapsed}ms ${req.method} ${req.url} company=${companyId}`,
          );
        }
      }),
    );
  }
}