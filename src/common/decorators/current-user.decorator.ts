import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtPayload } from '../../modules/auth/types/jwt-payload';

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): JwtPayload => {
    const req = ctx.switchToHttp().getRequest<{ user: JwtPayload }>();
    return req.user;
  },
);
