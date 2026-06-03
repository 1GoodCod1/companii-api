import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { defer, lastValueFrom } from 'rxjs';
import type { JwtPayload } from '../../modules/auth/types/jwt-payload';
import { PrismaService } from '../../modules/shared/database/prisma.service';
import { rlsContextFromUser } from './rls-context.util';

@Injectable()
export class RlsInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<{
      user?: JwtPayload;
      headers: Record<string, string | string[] | undefined>;
    }>();
    const user = req.user;
    if (!user) {
      return next.handle();
    }

    const ctx = rlsContextFromUser(user, {
      companyId: user.activeCompanyId,
    });
    // An END_CLIENT is not a member of any company — they must not inherit a
    // company-level grant. Their portal access is granted purely per-customer
    // (app_owns_customer in RLS policies), spanning every company they belong to.
    if (user.accountKind === 'END_CLIENT') {
      ctx.companyId = undefined;
    }

    return defer(() =>
      this.prisma.withRlsContext(ctx, () => lastValueFrom(next.handle())),
    );
  }
}
