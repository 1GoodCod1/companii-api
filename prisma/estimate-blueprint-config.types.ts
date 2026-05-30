/**
 * Единый контракт EstimateBlueprintConfig (backend source of truth).
 * Синхронизировать с companii-web/src/types/estimates.ts (задача A-02).
 */

import type { EstimateMeasurementUnit } from './estimate-measurement-units';

export type BlueprintWizardStep = 'object' | 'plan' | 'diagnostic' | 'stages' | 'review';

export type BlueprintSiteType = {
  value: string;
  label: string;
};

export type BlueprintPlanPointType = {
  type: string;
  label: string;
  color: string;
};

export type BlueprintWorkModule = {
  key: string;
  label: string;
  defaultEnabled?: boolean;
  stageCodes: string[];
  fieldKeys: string[];
  ruleKeys?: string[];
  requiresQtyKeys?: string[];
  helpText?: string;
  section?: string;
};

export type BlueprintCustomField = {
  key: string;
  label: string;
  type: 'number' | 'boolean' | 'select' | 'text';
  unit?: EstimateMeasurementUnit;
  required: boolean;
  defaultValue?: unknown;
  options?: string[];
  validation?: {
    min?: number;
    max?: number;
  };
  helpText?: string;
  warningRules?: Array<{ when: string; message: string }>;
  section?: string;
  placeholder?: string;
  directionKeys?: string[];
  dependentOnKey?: string;
  dependentOnValues?: string[];
};

export type BlueprintDiagnosticQuestion = {
  key: string;
  label: string;
  type: 'boolean' | 'number' | 'select';
  options?: string[];
  affectsKey?: string;
  increment?: number;
};

export type BlueprintStageDef = {
  code: string;
  name: string;
  kind: 'LABOR' | 'MATERIAL' | 'MIXED';
  description?: string;
  defaultLaborHours?: number;
  defaultLaborRate?: number;
  durationDays?: number;
  checklist?: string[];
  optional?: boolean;
  moduleKey?: string;
};

export type BlueprintPricingRuleEnabledWhen = {
  moduleEnabled?: string;
  anyQtyKeys?: string[];
  allQtyKeys?: string[];
};

export type BlueprintPricingRule = {
  stageCode: string;
  description: string;
  unit: EstimateMeasurementUnit;
  qtyKey: string;
  unitPrice: number;
  wastePct?: number;
  kind?: 'labor' | 'material';
  moduleKey?: string;
  enabledWhen?: BlueprintPricingRuleEnabledWhen;
  laborUnitPriceMultiplierKey?: string;
  materialUnitPriceMultiplierKey?: string;
};

export type BlueprintAccessDifficultyImpact = {
  easy: number;
  medium: number;
  difficult: number;
  appliesToMaterial?: boolean;
};

export type BlueprintUrgencyImpact = {
  urgent: number;
  emergency: number;
  appliesToMaterial?: boolean;
};

export type EstimateBlueprintConfig = {
  wizardSteps: BlueprintWizardStep[];
  siteTypes: BlueprintSiteType[];
  planPointTypes: BlueprintPlanPointType[];
  workModules?: BlueprintWorkModule[];
  customFields?: BlueprintCustomField[];
  diagnosticQuestions: BlueprintDiagnosticQuestion[];
  defaultStages: BlueprintStageDef[];
  pricingRules: BlueprintPricingRule[];
  defaultLaborRate: number;
  defaultMarginPct: number;
  accessDifficultyImpact?: BlueprintAccessDifficultyImpact;
  urgencyImpact?: BlueprintUrgencyImpact;
};
