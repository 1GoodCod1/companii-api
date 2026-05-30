import { Prisma } from '@prisma/client';
import type { EstimateMeasurementUnit } from '../../../prisma/estimate-measurement-units';
import type { EstimateFieldWarning } from './utils/estimate-custom-fields-validation.util';
import type { SanityWarning } from './utils/sanity-checks.util';

export const projectInclude = {
  customer: true,
  category: true,
  blueprint: true,
  sitePlan: true,
  quote: true,
  sourceLead: true,
  measurements: { orderBy: { key: 'asc' as const } },
  photos: { orderBy: { sortOrder: 'asc' as const } },
  stages: {
    orderBy: { sortOrder: 'asc' as const },
    include: { lines: { orderBy: { sortOrder: 'asc' as const } } },
  },
  interventions: {
    select: {
      id: true,
      number: true,
      status: true,
      type: true,
      scheduledAt: true,
      technician: { select: { fullName: true } },
    },
    orderBy: { createdAt: 'desc' as const },
  },
} satisfies Prisma.EstimateProjectInclude;

export type EstimateProjectDetail = Prisma.EstimateProjectGetPayload<{
  include: typeof projectInclude;
}>;

export type EstimateProjectUpdateResult = EstimateProjectDetail & {
  warnings: EstimateFieldWarning[];
};

export type CalculationTraceEntry = {
  key: string;
  value: number;
  unit: string;
  source: 'plan' | 'diagnostic' | 'fallback' | 'manual' | 'computed';
};

export type EstimateCalculateResult = EstimateProjectDetail & {
  calculationTrace: CalculationTraceEntry[];
  sanityWarnings: SanityWarning[];
};

export const portalEstimateInclude = {
  customer: true,
  category: { select: { id: true, name: true, slug: true } },
  company: { select: { id: true, name: true, slug: true } },
  blueprint: { select: { id: true, config: true } },
  stages: {
    orderBy: { sortOrder: 'asc' as const },
    include: { lines: { orderBy: { sortOrder: 'asc' as const } } },
  },
} satisfies Prisma.EstimateProjectInclude;

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function guessUnit(key: string): EstimateMeasurementUnit {
  if (key.endsWith('VolumeM3') || key.includes('Volume')) return 'm³';
  if (key.endsWith('Area') || key.includes('Area')) return 'm²';
  if (key.endsWith('LengthM') || key.includes('Length')) return 'm';
  if (key.endsWith('Hours') || key.includes('Hours')) return 'ore';
  if (key.endsWith('Kg') || key.endsWith('kg')) return 'kg';
  if (key.endsWith('Count') || key.endsWith('Units')) return 'buc';
  return 'buc';
}
