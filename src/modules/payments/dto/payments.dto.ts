import { CompanySubscriptionPlan } from '@prisma/client';
import { IsEnum, IsString, MaxLength } from 'class-validator';

export class SubscriptionCheckoutDto {
  @IsEnum(CompanySubscriptionPlan)
  planCode!: CompanySubscriptionPlan;
}

export class PaymentWebhookDto {
  @IsString()
  @MaxLength(128)
  externalId!: string;
  @IsString()
  @MaxLength(40)
  status!: string;
}
