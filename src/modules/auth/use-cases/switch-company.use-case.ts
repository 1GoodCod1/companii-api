import { Injectable } from '@nestjs/common';
import { AppErrors, AppErrorMessages } from '../../../common/errors';
import { PrismaService } from '../../shared/database/prisma.service';
import { AuditAction } from '../../audit/audit-action.enum';
import { AuditEntityType } from '../../audit/audit-entity-type.enum';
import { AuditService } from '../../audit/audit.service';
import { AuthJwtPayloadService } from '../services/auth-jwt-payload.service';
import { AuthSessionService } from '../services/auth-session.service';

@Injectable()
export class SwitchCompanyUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly jwtPayload: AuthJwtPayloadService,
    private readonly session: AuthSessionService,
  ) {}

  async execute(userId: string, companyId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw AppErrors.unauthorized(AppErrorMessages.AUTH_UNAUTHORIZED);
    if (!user.isActive) throw AppErrors.unauthorized(AppErrorMessages.AUTH_ACCOUNT_DISABLED);
    if (user.accountKind !== 'COMPANY_STAFF' && user.accountKind !== 'PLATFORM_ADMIN') {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_ACCESS_DENIED);
    }

    const payload = this.jwtPayload.buildPayload(user);
    const enriched = await this.jwtPayload.enrichPayload(payload, { preferredCompanyId: companyId });
    if (enriched.activeCompanyId !== companyId) {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_ACCESS_DENIED);
    }

    const result = await this.session.issue(enriched, true);
    void this.audit.log({
      userId,
      action: AuditAction.COMPANY_SWITCHED,
      entityType: AuditEntityType.Company,
      entityId: companyId,
      newData: { companyId },
    });
    return result;
  }
}
