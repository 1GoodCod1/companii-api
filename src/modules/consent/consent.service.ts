import { Injectable, Logger } from '@nestjs/common';
import { ConsentType, CompanyConsent } from '@prisma/client';
import { PrismaService } from '../shared/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuditEntityType } from '../audit/audit-entity-type.enum';
import { AuditAction } from '../audit/audit-action.enum';
import type { JwtPayload } from '../auth/types/jwt-payload';
import { AppErrorMessages, AppErrors } from '../../common/errors';

@Injectable()
export class ConsentService {
  private readonly logger = new Logger(ConsentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private getContext(user: JwtPayload) {
    if (!user.activeCompanyId || !user.memberId) {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_CONTEXT_REQUIRED);
    }
    return { companyId: user.activeCompanyId, memberId: user.memberId };
  }

  async grantConsent(
    user: JwtPayload,
    consentType: ConsentType,
    meta: { lawfulBasis: string; version: string; ipAddress?: string; userAgent?: string },
  ): Promise<CompanyConsent> {
    const { companyId, memberId } = this.getContext(user);

    const consent = await this.prisma.companyConsent.upsert({
      where: {
        companyId_memberId_consentType: {
          companyId,
          memberId,
          consentType,
        },
      },
      create: {
        companyId,
        memberId,
        consentType,
        granted: true,
        lawfulBasis: meta.lawfulBasis,
        version: meta.version,
        ipAddress: meta.ipAddress ?? null,
      },
      update: {
        granted: true,
        lawfulBasis: meta.lawfulBasis,
        version: meta.version,
        ipAddress: meta.ipAddress ?? null,
        revokedAt: null,
      },
    });

    this.logger.log(
      `Consent GRANTED: companyId=${companyId}, memberId=${memberId}, type=${consentType}, version=${meta.version}`,
    );
    await this.audit.log({
      userId: user.sub,
      action: AuditAction.CONSENT_GRANTED,
      entityType: AuditEntityType.CompanyConsent,
      entityId: consent.id,
      newData: {
        consentType,
        companyId,
        memberId,
        lawfulBasis: meta.lawfulBasis,
        version: meta.version,
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return consent;
  }

  async revokeConsent(
    user: JwtPayload,
    consentType: ConsentType,
    meta: { ipAddress?: string; userAgent?: string },
  ): Promise<CompanyConsent> {
    const { companyId, memberId } = this.getContext(user);

    const existing = await this.prisma.companyConsent.findUnique({
      where: {
        companyId_memberId_consentType: {
          companyId,
          memberId,
          consentType,
        },
      },
    });

    if (!existing) {
      throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    }

    const consent = await this.prisma.companyConsent.update({
      where: {
        companyId_memberId_consentType: {
          companyId,
          memberId,
          consentType,
        },
      },
      data: {
        granted: false,
        revokedAt: new Date(),
      },
    });

    this.logger.log(`Consent REVOKED: companyId=${companyId}, memberId=${memberId}, type=${consentType}`);

    // Audit Log recording (GDPR requirement)
    await this.audit.log({
      userId: user.sub,
      action: AuditAction.CONSENT_REVOKED,
      entityType: AuditEntityType.CompanyConsent,
      entityId: consent.id,
      newData: {
        consentType,
        companyId,
        memberId,
        revokedAt: consent.revokedAt,
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return consent;
  }

  async hasConsent(companyId: string, memberId: string, consentType: ConsentType): Promise<boolean> {
    const consent = await this.prisma.companyConsent.findUnique({
      where: {
        companyId_memberId_consentType: {
          companyId,
          memberId,
          consentType,
        },
      },
    });
    return consent?.granted === true && consent.revokedAt === null;
  }

  async getMyConsents(user: JwtPayload): Promise<CompanyConsent[]> {
    const { companyId, memberId } = this.getContext(user);
    return this.prisma.companyConsent.findMany({
      where: { companyId, memberId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
