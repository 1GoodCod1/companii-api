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

const SENSITIVE_KEY_PATTERN =
  /pass(word)?|token|secret|otp|^pin$|^code$|api[-_]?key|authorization|^hash$/i;
const SANITIZE_MAX_DEPTH = 6;
const REDACTED = '***REDACTED***';
const AUDITED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

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
    if (!AUDITED_METHODS.has(method)) return true;

    const p = path.split('?')[0] ?? path;
    if (p.startsWith('/health') || p.startsWith('/docs') || p.startsWith('/metrics')) {
      return true;
    }
    if (
      p.includes('/auth/login') ||
      p.includes('/auth/register') ||
      p.includes('/auth/refresh') ||
      p.includes('/auth/forgot-password') ||
      p.includes('/auth/reset-password') ||
      p.includes('/auth/logout')
    ) {
      return true;
    }
    return false;
  }

  private sanitize(input: unknown, depth = 0): unknown {
    if (input == null) return input;
    if (depth > SANITIZE_MAX_DEPTH) return '[depth-truncated]';
    if (Array.isArray(input)) {
      return input.map((item) => this.sanitize(item, depth + 1));
    }
    if (typeof input !== 'object') return input;
    const obj = input as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        out[key] = value == null ? value : REDACTED;
      } else {
        out[key] = this.sanitize(value, depth + 1);
      }
    }
    return out;
  }
}
