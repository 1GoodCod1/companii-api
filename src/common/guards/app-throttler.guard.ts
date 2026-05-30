import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { GLOBAL_PREFIX_EXCLUDE } from '../../config/http-app';

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (process.env.NODE_ENV === 'test') {
      return true;
    }
    const req = context.switchToHttp().getRequest<{ url?: string; path?: string }>();
    const path = req.url?.split('?')[0] ?? req.path ?? '';
    const skipPaths = GLOBAL_PREFIX_EXCLUDE.map((p) =>
      typeof p === 'string' ? p : p.path,
    );
    if (skipPaths.some((p) => path === `/${p}` || path.endsWith(`/${p}`) || path === p)) {
      return true;
    }
    return super.shouldSkip(context);
  }
}
