import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Prisma } from '@prisma/client';
import { AuditService } from './audit.service';
import { AuditEntityType } from './audit-entity-type.enum';

interface RequestWithUser extends Request {
  user?: { sub?: string };
}

const SENSITIVE = ['password', 'token', 'secret', 'passwordHash'];

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.config.get<boolean>('audit.httpEnabled')) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const response = context.switchToHttp().getResponse<Response>();

    if (this.shouldSkip(request.path, request.method)) {
      return next.handle();
    }

    const start = Date.now();
    return next.handle().pipe(
      tap((data) => {
        void this.audit
          .log({
            userId: request.user?.sub,
            action: `${request.method} ${request.path}`,
            entityType: AuditEntityType.HttpRequest,
            oldData: {
              method: request.method,
              path: request.path,
              body: this.sanitize(request.body),
            } as Prisma.InputJsonValue,
            newData: {
              statusCode: response.statusCode,
              duration: Date.now() - start,
              responseKeys:
                data && typeof data === 'object' ? Object.keys(data as object) : undefined,
            } as Prisma.InputJsonValue,
            ipAddress: request.ip,
            userAgent: request.get('user-agent'),
          })
          .catch((err) => this.logger.error('Audit failed', err));
      }),
    );
  }

  private shouldSkip(path: string, method: string): boolean {
    const p = path.split('?')[0] ?? path;
    if (p.startsWith('/health') || p.startsWith('/docs') || p.startsWith('/metrics')) {
      return true;
    }
    if (
      p.includes('/auth/login') ||
      p.includes('/auth/register') ||
      method === 'GET' && p.includes('/auth/')
    ) {
      return true;
    }
    return false;
  }

  private sanitize(body: unknown): unknown {
    if (!body || typeof body !== 'object') return body;
    const out = { ...(body as Record<string, unknown>) };
    for (const key of SENSITIVE) {
      if (key in out && out[key] != null) out[key] = '***REDACTED***';
    }
    return out;
  }
}
