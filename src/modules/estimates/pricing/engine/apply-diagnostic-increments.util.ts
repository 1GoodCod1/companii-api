import type { EstimateBlueprintConfig } from '../pricing.types';
import type { MeasurementMap } from './pricing-engine.types';

export function applyDiagnosticIncrements(
  config: EstimateBlueprintConfig,
  measurements: MeasurementMap,
  diagnosticAnswers: Record<string, unknown> | null | undefined,
): MeasurementMap {
  const result = { ...measurements };
  if (!diagnosticAnswers) return result;

  for (const question of config.diagnosticQuestions) {
    if (!question.affectsKey || !question.increment) continue;
    const val = diagnosticAnswers[question.key];
    if (val === true) {
      result[question.affectsKey] = (result[question.affectsKey] ?? 0) + question.increment;
    }
    if (typeof val === 'number' && question.type === 'number') {
      result[question.key] = val;
    }
  }

  return result;
}
