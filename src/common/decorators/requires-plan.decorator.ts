import { SetMetadata } from '@nestjs/common';
import type { CompanySubscriptionPlan } from '@prisma/client';

export const REQUIRES_PLAN_KEY = 'requires_plan';

export const RequiresPlan = (...plans: CompanySubscriptionPlan[]) =>
  SetMetadata(REQUIRES_PLAN_KEY, plans);
