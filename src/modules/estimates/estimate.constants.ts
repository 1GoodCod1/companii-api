import { Prisma } from '@prisma/client';

export const projectInclude = {
  customer: true,
  category: true,
  blueprint: true,
  sitePlan: true,
  quote: true,
  sourceLead: true,
  measurements: { orderBy: { key: 'asc' as const } },
  stages: {
    orderBy: { sortOrder: 'asc' as const },
    include: { lines: { orderBy: { sortOrder: 'asc' as const } } },
  },
} satisfies Prisma.EstimateProjectInclude;

export const portalEstimateInclude = {
  customer: true,
  category: { select: { id: true, name: true, slug: true } },
  company: { select: { id: true, name: true, slug: true } },
  stages: {
    orderBy: { sortOrder: 'asc' as const },
    include: { lines: { orderBy: { sortOrder: 'asc' as const } } },
  },
} satisfies Prisma.EstimateProjectInclude;

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function guessUnit(key: string): string {
  if (key.endsWith('VolumeM3') || key.includes('Volume')) return 'm³';
  if (key.endsWith('Area') || key.includes('Area')) return 'm²';
  if (key.endsWith('LengthM') || key.includes('Length')) return 'm';
  if (key.endsWith('Hours') || key.includes('Hours')) return 'ore';
  if (key.endsWith('Count') || key.endsWith('Units')) return 'buc';
  return 'buc';
}
