import type { AccountKind, CompanyRole } from '@prisma/client';

export interface RlsContext {
  userId: string;
  accountKind: AccountKind;
  companyId?: string;
  companyRole?: CompanyRole;
  memberId?: string;
  customerId?: string;
}
