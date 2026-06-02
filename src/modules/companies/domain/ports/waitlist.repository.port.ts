import type { CompanyWaitlist } from '@prisma/client';

export const WAITLIST_REPOSITORY = Symbol('WaitlistRepository');

export interface WaitlistRepository {
  create(email: string, companyName: string): Promise<CompanyWaitlist>;
  findRecent(limit: number): Promise<CompanyWaitlist[]>;
}
