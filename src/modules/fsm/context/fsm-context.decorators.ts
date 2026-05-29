import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AppErrorMessages, AppErrors } from '../../../common/errors';

export const ActiveCompanyId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    if (!user || !user.activeCompanyId) {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_CONTEXT_REQUIRED);
    }
    return user.activeCompanyId;
  },
);

export const IsTechnician = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): boolean => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return user?.companyRole === 'MEMBER';
  },
);

export const CurrentUserMemberId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return user?.memberId;
  },
);
