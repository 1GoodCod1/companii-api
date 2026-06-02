import { Injectable } from '@nestjs/common';
import { Prisma, ConsentType } from '@prisma/client';
import { PrismaService } from '@/modules/shared/database/prisma.service';
import type { ConsentRepository } from '../../domain/ports/consent.repository.port';

@Injectable()
export class PrismaConsentRepository implements ConsentRepository {
  constructor(private readonly prisma: PrismaService) {}

  upsertConsent(
    companyId: string,
    memberId: string,
    consentType: ConsentType,
    createData: Prisma.CompanyConsentUncheckedCreateInput,
    updateData: Prisma.CompanyConsentUncheckedUpdateInput,
  ) {
    return this.prisma.companyConsent.upsert({
      where: {
        companyId_memberId_consentType: {
          companyId,
          memberId,
          consentType,
        },
      },
      create: createData,
      update: updateData,
    });
  }

  findConsent(companyId: string, memberId: string, consentType: ConsentType) {
    return this.prisma.companyConsent.findUnique({
      where: {
        companyId_memberId_consentType: {
          companyId,
          memberId,
          consentType,
        },
      },
    });
  }

  updateConsent(
    companyId: string,
    memberId: string,
    consentType: ConsentType,
    data: Prisma.CompanyConsentUncheckedUpdateInput,
  ) {
    return this.prisma.companyConsent.update({
      where: {
        companyId_memberId_consentType: {
          companyId,
          memberId,
          consentType,
        },
      },
      data,
    });
  }

  findConsents(companyId: string, memberId: string) {
    return this.prisma.companyConsent.findMany({
      where: { companyId, memberId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
