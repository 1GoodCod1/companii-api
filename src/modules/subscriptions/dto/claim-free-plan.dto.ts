import { IsIn } from 'class-validator';
import { SUBSCRIPTION_CLAIMABLE_PLANS } from '../../../common/constants/subscription-plan.constants';

export class ClaimFreePlanDto {
  @IsIn(SUBSCRIPTION_CLAIMABLE_PLANS)
  planCode!: (typeof SUBSCRIPTION_CLAIMABLE_PLANS)[number];
}
