import { CompanySubscriptionPlan } from '@prisma/client';
import { IsIn } from 'class-validator';

const CLAIMABLE_PLANS = ['PRO', 'BUSINESS'] as const satisfies readonly CompanySubscriptionPlan[];

export class ClaimFreePlanDto {
  @IsIn(CLAIMABLE_PLANS)
  planCode!: (typeof CLAIMABLE_PLANS)[number];
}
