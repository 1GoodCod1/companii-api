import type { Plan2dData } from '../../plan2d.types';
import { round2 } from '../../../estimate.constants';
import { readNumber, readBoolean, type MeasurementMap } from '../category-shared.util';


function normalizeMembraneType(type: unknown): 'bitumen' | 'tpo' | 'pvc' | 'epdm' {
  const normalized = String(type ?? 'bitumen_membrane').toLowerCase();
  if (normalized === 'tpo') return 'tpo';
  if (normalized === 'pvc') return 'pvc';
  if (normalized === 'epdm') return 'epdm';
  return 'bitumen';
}
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
  measurements.roofAreaLabor = roofArea;

  const perimeterEstimate = round2(Math.sqrt(roofArea) * 4);
  const insulationThicknessCm = readNumber(diagnostic, 'insulationThicknessCm') ?? 10;
  measurements.insulationThicknessCm = insulationThicknessCm;
  measurements.insulationArea = roofArea;
  measurements.insulationVolumeM3 = round2(roofArea * (insulationThicknessCm / 100));
  measurements.vaporBarrierArea = roofArea;

  const membraneType = normalizeMembraneType(diagnostic?.waterproofingType);
  measurements.membraneAreaBitumen = membraneType === 'bitumen' ? roofArea : 0;
  measurements.membraneAreaTpo = membraneType === 'tpo' ? roofArea : 0;
  measurements.membraneAreaPvc = membraneType === 'pvc' ? roofArea : 0;
  measurements.membraneAreaEpdm = membraneType === 'epdm' ? roofArea : 0;

  const drainCount = Math.max(
    0,
    readNumber(diagnostic, 'drainCount') ?? pointsCount('drain') ?? 0,
  );
  measurements.drainCount = drainCount;
  const parapetLengthM =
    readNumber(diagnostic, 'parapetLengthM') ?? Math.max(0, perimeterEstimate);
  const parapetHeightM = Math.max(0, readNumber(diagnostic, 'parapetHeightM') ?? 0.5);
  measurements.parapetLengthM = parapetLengthM;
  measurements.parapetHeightM = parapetHeightM;
  measurements.parapetFaceArea = round2(parapetLengthM * parapetHeightM);

  const isTerrace = readBoolean(diagnostic, 'isTerrace');
  const terraceArea = readNumber(diagnostic, 'terraceArea') ?? (isTerrace ? roofArea : 0);
  measurements.terraceArea = Math.max(0, terraceArea);
  measurements.skylightCount = Math.max(
    0,
    readNumber(diagnostic, 'skylightCount') ?? 0,
  );

  const oldRoofRemoval = readBoolean(diagnostic, 'oldRoofRemoval');
  measurements.oldRoofRemovalArea = oldRoofRemoval ? roofArea : 0;

  const ballastIncluded = readBoolean(diagnostic, 'ballastIncluded');
  measurements.ballastArea = ballastIncluded ? roofArea : 0;
  measurements.requiresManualReview = roofArea > 500 ? 1 : 0;

  return measurements;
}
