import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { CompanyAuthorizationService } from '../authorization/company-authorization.service';

const EXCLUDED_ACTIONS = [
  'HTTP_REQUEST',
  'LOGIN_SUCCESS',
  'LOGIN_FAILED',
  'USER_REGISTERED',
  'CONSENT_GRANTED',
  'CONSENT_REVOKED',
  'PASSWORD_RESET_REQUESTED',
  'PASSWORD_RESET_COMPLETED',
];

@Injectable()
export class GetCompanyAuditLogsUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companyAuth: CompanyAuthorizationService,
  ) {}

  async execute(
    user: JwtPayload,
    companyId: string,
    query: { action?: string; userId?: string; limit?: number },
  ) {
    this.companyAuth.assertSameCompanyContext(user, companyId);
    await this.companyAuth.assertCompanyOwner(user, companyId);

    const members = await this.prisma.companyMember.findMany({
      where: { companyId },
      select: { userId: true, id: true },
    });
    const userIds = members.map((m) => m.userId);
    const memberIds = members.map((m) => m.id);

    const limit = query.limit ?? 50;

    return this.prisma.auditLog.findMany({
      where: {
        OR: [
          { userId: { in: userIds } },
          { entityType: 'Company', entityId: companyId },
          { entityType: 'CompanyMember', entityId: { in: memberIds } },
        ],
        action: {
          ...(query.action ? { equals: query.action } : {}),
          notIn: EXCLUDED_ACTIONS,
        },
        ...(query.userId ? { userId: query.userId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });
  }
}
