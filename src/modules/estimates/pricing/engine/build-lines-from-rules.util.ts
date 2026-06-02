import type { BlueprintPricingRule } from '../pricing.types';
import { isPricingRuleActive, getDefaultEnabledWorkModules } from '../../utils/blueprint/work-modules.util';
import { round2 } from '../shared/pricing-shared.util';
import type {
  BuildLinesFromRulesOptions,
  MeasurementMap,
  PricingRuleLine,
} from './pricing-engine.types';

function formatScaffoldingRentalDescription(
  measurements: MeasurementMap,
  diagnostic: Record<string, unknown> | null | undefined,
): string {
  const scaffoldingArea = measurements.scaffoldingArea ?? measurements.facadeArea ?? 0;
  const duration = Number(diagnostic?.scaffoldingRentalDuration ?? 1);
  const period = String(diagnostic?.scaffoldingRentalPeriod ?? 'months').toLowerCase();

  let durationInMonths = duration;
  let label = 'luni';
  if (period === 'days') {
    durationInMonths = duration / 30;
    label = `zile (${round2(durationInMonths)} luni)`;
  } else if (period === 'weeks') {
    durationInMonths = (duration * 7) / 30;
    label = `săpt. (${round2(durationInMonths)} luni)`;
  } else {
    label = duration === 1 ? 'lună' : 'luni';
  }

  const formattedDuration = duration === 1 && period === 'months' ? '1 lună' : `${duration} ${label}`;
  return `Închiriere schelă (${scaffoldingArea} m² × ${formattedDuration})`;
}

export function buildLinesFromRules(
  rules: BlueprintPricingRule[],
  measurements: MeasurementMap,
  options?: BuildLinesFromRulesOptions,
): PricingRuleLine[] {
  const lines: PricingRuleLine[] = [];
  const laborMult = options?.laborMultiplier ?? 1;
  const materialMult = options?.materialMultiplier ?? 1;
  const includeMaterials = options?.includeMaterials ?? true;

  for (const rule of rules) {
    if (!includeMaterials && (rule.kind ?? 'material') === 'material') {
      continue;
    }

    if (options?.config?.workModules?.length) {
      const enabledModules =
        options.enabledWorkModules ?? getDefaultEnabledWorkModules(options.config);
      if (!isPricingRuleActive(rule, enabledModules, measurements, options.config)) {
        continue;
      }
    }

    const rawQty = measurements[rule.qtyKey] ?? 0;
    if (rawQty <= 0) continue;

    const waste = rule.wastePct ? 1 + rule.wastePct / 100 : 1;
    const qty = round2(rawQty * waste);
    const kind = rule.kind ?? 'material';
    const ruleLaborMult =
      kind === 'labor' && rule.laborUnitPriceMultiplierKey
        ? (measurements[rule.laborUnitPriceMultiplierKey] ?? 1)
        : 1;
    const ruleMaterialMult =
      kind === 'material' && rule.materialUnitPriceMultiplierKey
        ? (measurements[rule.materialUnitPriceMultiplierKey] ?? 1)
        : 1;
    const mult = kind === 'labor' ? laborMult * ruleLaborMult : materialMult * ruleMaterialMult;
    const unitPrice = round2(rule.unitPrice * mult);
    const lineTotal = round2(qty * unitPrice);

    let description = rule.description;
    if (rule.qtyKey === 'scaffoldingRentalArea') {
      description = formatScaffoldingRentalDescription(measurements, options?.diagnostic);
    }

    lines.push({
      stageCode: rule.stageCode,
      description,
      qty,
      unit: rule.unit,
      unitPrice,
      lineTotal,
      source: 'rule',
      kind,
    });
  }

  return lines;
}
