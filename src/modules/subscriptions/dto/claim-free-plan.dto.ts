import { Type } from 'class-transformer';
import { IsIn, IsString } from 'class-validator';
import type { CompanySubscriptionPlan } from '@prisma/client';
import { SUBSCRIPTION_CLAIMABLE_PLANS } from '../../../common/constants/subscription-plan.constants';

export class ClaimFreePlanDto {
  @IsString()
  @IsIn(SUBSCRIPTION_CLAIMABLE_PLANS)
  @Type(() => String)
  planCode!: CompanySubscriptionPlan;
}
