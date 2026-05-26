import { Injectable } from '@nestjs/common';
import { AppErrors, AppErrorMessages } from '../../../common/errors';
import { PrismaService } from '../../shared/database/prisma.service';
import { AuthJwtPayloadService } from '../services/auth-jwt-payload.service';
import { AuthSessionService } from '../services/auth-session.service';

@Injectable()
export class RefreshCompanyContextUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtPayload: AuthJwtPayloadService,
    private readonly session: AuthSessionService,
  ) {}

  async execute(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw AppErrors.unauthorized(AppErrorMessages.AUTH_UNAUTHORIZED);
    if (!user.isActive) throw AppErrors.unauthorized(AppErrorMessages.AUTH_ACCOUNT_DISABLED);

    const payload = this.jwtPayload.buildPayload(user);
    const enriched = await this.jwtPayload.enrichPayload(payload);
    return this.session.issue(enriched, true);
  }
}
