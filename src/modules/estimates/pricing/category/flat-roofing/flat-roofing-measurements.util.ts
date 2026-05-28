import type { Plan2dData } from '../../plan2d.types';
import { round2 } from '../../../estimate.constants';

export type MeasurementMap = Record<string, number>;

function readNumber(source: Record<string, unknown> | null | undefined, key: string): number | undefined {
  const value = source?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function readBoolean(source: Record<string, unknown> | null | undefined, key: string): boolean {
  const value = source?.[key];
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return false;
}

function normalizeMembraneType(type: unknown): 'bitumen' | 'tpo' | 'pvc' | 'epdm' {
  const normalized = String(type ?? 'bitumen_membrane').toLowerCase();
  if (normalized === 'tpo') return 'tpo';
  if (normalized === 'pvc') return 'pvc';
  if (normalized === 'epdm') return 'epdm';
  // accept both `bitumen` and `bitumen_membrane` for backwards compat
  return 'bitumen';
}

/**
 * Category-specific measurements for `acoperis-plat` (flat roof).
 *
 * Key difference from pitched roof: NO slope adjustment — roof area === base area.
 * Surface is largely the deck itself plus parapet ascent.
 */
export function deriveFlatRoofMeasurements(
  plan2d: Plan2dData | null | undefined,
  diagnostic: Record<string, unknown> | null | undefined,
  base: MeasurementMap,
): MeasurementMap {
  const measurements: MeasurementMap = { ...base };
  const pointsCount = (type: string) => plan2d?.points?.filter((p) => p.type === type).length ?? 0;

  const roofArea = Math.max(
    5,
    readNumber(diagnostic, 'roofArea') ??
      readNumber(diagnostic, 'baseArea') ??
      measurements.baseArea ??
      measurements.totalFloorArea ??
      30,
  );
  measurements.roofArea = roofArea;
  measurements.baseArea = roofArea;
  // No slope multiplier for flat roof — labor area = roof area.
  measurements.roofAreaLabor = roofArea;

  const perimeterEstimate = round2(Math.sqrt(roofArea) * 4);

  // Vapor barrier + insulation share the roof area.
  const insulationThicknessCm = readNumber(diagnostic, 'insulationThicknessCm') ?? 10;
  measurements.insulationThicknessCm = insulationThicknessCm;
  measurements.insulationArea = roofArea;
  measurements.insulationVolumeM3 = round2(roofArea * (insulationThicknessCm / 100));
  measurements.vaporBarrierArea = roofArea;

  // Membrane: pricing rules use per-type qty keys. Only the rule matching the
  // selected `waterproofingType` will see a non-zero qty and produce a line.
  const membraneType = normalizeMembraneType(diagnostic?.waterproofingType);
  measurements.membraneAreaBitumen = membraneType === 'bitumen' ? roofArea : 0;
  measurements.membraneAreaTpo = membraneType === 'tpo' ? roofArea : 0;
  measurements.membraneAreaPvc = membraneType === 'pvc' ? roofArea : 0;
  measurements.membraneAreaEpdm = membraneType === 'epdm' ? roofArea : 0;

  // Drains — internal water outlets through the deck.
  const drainCount = Math.max(
    0,
    readNumber(diagnostic, 'drainCount') ?? pointsCount('drain') ?? 0,
  );
  measurements.drainCount = drainCount;

  // Parapets — raised perimeter edges. Length defaults to perimeter; height
  // controls how much wall finishing is needed on the inner face.
  const parapetLengthM =
    readNumber(diagnostic, 'parapetLengthM') ?? Math.max(0, perimeterEstimate);
  const parapetHeightM = Math.max(0, readNumber(diagnostic, 'parapetHeightM') ?? 0.5);
  measurements.parapetLengthM = parapetLengthM;
  measurements.parapetHeightM = parapetHeightM;
  measurements.parapetFaceArea = round2(parapetLengthM * parapetHeightM);

  // Optional terrace finishing (walkable pavers / tiles on top of membrane).
  const isTerrace = readBoolean(diagnostic, 'isTerrace');
  const terraceArea = readNumber(diagnostic, 'terraceArea') ?? (isTerrace ? roofArea : 0);
  measurements.terraceArea = Math.max(0, terraceArea);

  // Skylights — flat-roof units (different from pitched Velux but priced similar).
  measurements.skylightCount = Math.max(
    0,
    readNumber(diagnostic, 'skylightCount') ?? 0,
  );

  // Optional demolition (old waterproofing + insulation removal).
  const oldRoofRemoval = readBoolean(diagnostic, 'oldRoofRemoval');
  measurements.oldRoofRemovalArea = oldRoofRemoval ? roofArea : 0;

  // Ballast (gravel / pavers on top of membrane, optional). Tons rough estimate.
  const ballastIncluded = readBoolean(diagnostic, 'ballastIncluded');
  measurements.ballastArea = ballastIncluded ? roofArea : 0;

  // Manual review trigger — non-rectangular shapes or huge terraces.
  measurements.requiresManualReview = roofArea > 500 ? 1 : 0;

  return measurements;
}
