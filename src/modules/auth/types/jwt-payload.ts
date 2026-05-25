import type { AccountKind, CompanyRole } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  accountKind: AccountKind;
  activeCompanyId?: string;
  memberId?: string;
  customerId?: string;
  companyRole?: CompanyRole;
}
