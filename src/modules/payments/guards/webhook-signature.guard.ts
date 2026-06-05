import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import { AppErrorMessages, AppErrors } from '../../../common/errors';

@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  private readonly logger = new Logger(WebhookSignatureGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<Request & { rawBody?: Buffer }>();

    const secret = this.config.get<string>('payments.webhookSecret');
    const isProd = this.config.get<string>('nodeEnv') === 'production';

    if (!secret) {
      if (isProd) {
        this.logger.error(
          'PAYMENTS_WEBHOOK_SECRET is not configured — rejecting webhook.',
        );
        throw AppErrors.forbidden(AppErrorMessages.WEBHOOK_SIGNATURE_INVALID);
      }
      this.logger.warn(
        'PAYMENTS_WEBHOOK_SECRET not set — skipping signature check (non-production only).',
      );
      return true;
    }

    const provided = this.extractSignature(req);
    const raw = req.rawBody;
    if (!provided || !raw || raw.length === 0) {
      throw AppErrors.forbidden(AppErrorMessages.WEBHOOK_SIGNATURE_INVALID);
    }

    const expected = createHmac('sha256', secret).update(raw).digest('hex');
    if (!this.timingSafeHexEquals(expected, provided)) {
      throw AppErrors.forbidden(AppErrorMessages.WEBHOOK_SIGNATURE_INVALID);
    }
    return true;
  }

  private extractSignature(req: Request): string | null {
    const header =
      req.headers['x-webhook-signature'] ?? req.headers['x-signature'];
    const value = Array.isArray(header) ? header[0] : header;
    if (!value) return null;
    return value.startsWith('sha256=') ? value.slice('sha256='.length) : value;
  }

  private timingSafeHexEquals(a: string, b: string): boolean {
    let aBuf: Buffer;
    let bBuf: Buffer;
    try {
      aBuf = Buffer.from(a, 'hex');
      bBuf = Buffer.from(b, 'hex');
    } catch {
      return false;
    }
    if (aBuf.length === 0 || aBuf.length !== bBuf.length) return false;
    return timingSafeEqual(aBuf, bBuf);
  }
}
