import { SetMetadata } from '@nestjs/common';
import type { CompanyRole } from '@prisma/client';
import { COMPANY_ROLES_KEY } from '@/modules/companies/guards/company.guard';

export const CompanyRoles = (...roles: CompanyRole[]) =>
  SetMetadata(COMPANY_ROLES_KEY, roles);
