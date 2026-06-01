import type { BlueprintPricingRule, EstimateBlueprintConfig } from '../pricing.types';

export type MeasurementMap = Record<string, number>;

export type PricingRuleLine = {
  stageCode: string;
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
  source: string;
  kind: 'labor' | 'material';
};

export type BuildLinesFromRulesOptions = {
  enabledWorkModules?: string[];
  config?: EstimateBlueprintConfig;
  laborMultiplier?: number;
  materialMultiplier?: number;
  includeMaterials?: boolean;
  diagnostic?: Record<string, unknown> | null;
};

export type CustomPricingOverrideResult = {
  measurements: MeasurementMap;
  rules: BlueprintPricingRule[];
  customDurationDays?: number;
  customLaborHours?: number;
  customLaborTotal?: number;
};
