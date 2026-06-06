import { IsIn, IsOptional } from 'class-validator';
import { ANALYTICS_PERIODS, type AnalyticsPeriod } from '../services/analytics/analytics.types';

export class AnalyticsOverviewQueryDto {
  @IsOptional()
  @IsIn(ANALYTICS_PERIODS)
  period?: AnalyticsPeriod;
}
