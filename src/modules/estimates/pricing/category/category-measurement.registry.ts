import type { CategoryMeasurementStrategy } from './category-shared.util';
import { deriveSantehnikaMeasurements } from './plumbing/plumbing-measurements.util';
import { deriveElektrikaMeasurements } from './electrical/electrical-measurements.util';
import { deriveClimaMeasurements } from './climate/climate-measurements.util';
import { deriveFinisajMeasurements } from './finishing/finishing-measurements.util';
import { deriveAcoperisMeasurements } from './roofing/roofing-measurements.util';
import { deriveFlatRoofMeasurements } from './flat-roofing/flat-roofing-measurements.util';
import { deriveFatadeMeasurements } from './facade/facade-measurements.util';
import { deriveOknaDveriMeasurements } from './windows-doors/windows-doors-measurements.util';
import { deriveMobilaMeasurements } from './furniture/furniture-measurements.util';
import { deriveCleaningMeasurements } from './cleaning/cleaning-measurements.util';
import { deriveItNetworksMeasurements } from './it-networks/it-networks-measurements.util';
import { deriveItHardwareMeasurements } from './it-hardware/it-hardware-measurements.util';
import { derivePanouriSolareMeasurements } from './solar/solar-measurements.util';
import { deriveConstructiiMeasurements } from './constructii/constructii-measurements.util';
import { derivePavajMeasurements } from './pavaj/pavaj-measurements.util';

const STRATEGIES: CategoryMeasurementStrategy[] = [
  { slug: 'santehnika',      deriveMeasurements: deriveSantehnikaMeasurements },
  { slug: 'elektrika',       deriveMeasurements: deriveElektrikaMeasurements },
  { slug: 'clima',           deriveMeasurements: deriveClimaMeasurements },
  { slug: 'lucrari-finisaj', deriveMeasurements: deriveFinisajMeasurements },
  { slug: 'acoperis',        deriveMeasurements: deriveAcoperisMeasurements },
  { slug: 'acoperis-plat',   deriveMeasurements: deriveFlatRoofMeasurements },
  { slug: 'fatade',          deriveMeasurements: deriveFatadeMeasurements },
  { slug: 'okna-dveri',      deriveMeasurements: deriveOknaDveriMeasurements },
  { slug: 'mobila',          deriveMeasurements: deriveMobilaMeasurements },
  { slug: 'cleaning',        deriveMeasurements: deriveCleaningMeasurements },
  { slug: 'it-networks',     deriveMeasurements: deriveItNetworksMeasurements },
  { slug: 'it-hardware',     deriveMeasurements: deriveItHardwareMeasurements },
  { slug: 'panouri-solare',  deriveMeasurements: derivePanouriSolareMeasurements },
  { slug: 'constructii',     deriveMeasurements: deriveConstructiiMeasurements },
  { slug: 'pavaj',           deriveMeasurements: derivePavajMeasurements },
];

const REGISTRY = new Map<string, CategoryMeasurementStrategy>(
  STRATEGIES.map((strategy) => [strategy.slug, strategy]),
);

export function getCategoryStrategy(slug: string): CategoryMeasurementStrategy | undefined {
  return REGISTRY.get(slug);
}
