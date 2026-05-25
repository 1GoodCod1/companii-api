import { SetMetadata } from '@nestjs/common';
import type { PlanFeatureKey } from '../constants/plan-entitlements.constants';

export const REQUIRES_FEATURE_KEY = 'requires_feature';

export const RequiresFeature = (...features: PlanFeatureKey[]) =>
  SetMetadata(REQUIRES_FEATURE_KEY, features);
