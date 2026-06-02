import { ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import {
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import { GLOBAL_PREFIX_EXCLUDE } from '../../config/http-app';

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  constructor(
    options: ThrottlerModuleOptions,
    storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly configService: ConfigService,
  ) {
    super(options, storageService, reflector);
  }

  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (this.configService.get<string>('nodeEnv') === 'test') {
      return await true;
    }
    const req = context.switchToHttp().getRequest<{ url?: string; path?: string }>();
    const path = req.url?.split('?')[0] ?? req.path ?? '';
    const skipPaths = GLOBAL_PREFIX_EXCLUDE.map((p) =>
      typeof p === 'string' ? p : p.path,
    );
    if (skipPaths.some((p) => path === `/${p}` || path.endsWith(`/${p}`) || path === p)) {
      return await true;
    }
    return await super.shouldSkip(context);
  }
}
