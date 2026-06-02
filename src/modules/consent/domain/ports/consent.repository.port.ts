import type { CompanyConsent, ConsentType, Prisma } from '@prisma/client';

export const CONSENT_REPOSITORY = Symbol('ConsentRepository');

export interface ConsentRepository {
  upsertConsent(
    companyId: string,
    memberId: string,
    consentType: ConsentType,
    createData: Prisma.CompanyConsentUncheckedCreateInput,
    updateData: Prisma.CompanyConsentUncheckedUpdateInput,
  ): Promise<CompanyConsent>;
  findConsent(companyId: string, memberId: string, consentType: ConsentType): Promise<CompanyConsent | null>;
  updateConsent(
    companyId: string,
    memberId: string,
    consentType: ConsentType,
    data: Prisma.CompanyConsentUncheckedUpdateInput,
  ): Promise<CompanyConsent>;
  findConsents(companyId: string, memberId: string): Promise<CompanyConsent[]>;
}
