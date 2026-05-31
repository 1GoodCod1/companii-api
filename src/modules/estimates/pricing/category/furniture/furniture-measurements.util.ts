import type { Plan2dData } from '../../plan2d.types';
import { round2 } from '../../../estimate.constants';
import { readNumber, readBoolean, type MeasurementMap } from '../category-shared.util';
import {
  type CompanyPricingModifiers,
  resolvePricingModifierFactor,
} from '../../../../../../prisma/estimate-pricing-modifiers';

export function resolveHardwareCostMultiplier(
  hardwareTier: unknown,
  overrides?: CompanyPricingModifiers | null,
): number {
  const normalized = String(hardwareTier ?? 'basic')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');

  if (normalized === 'premium') return resolvePricingModifierFactor('mobila.hardwareTier.premium', overrides);
  if (normalized === 'standard') return resolvePricingModifierFactor('mobila.hardwareTier.standard', overrides);
  return 1.0;
}

function resolveMaterialMultiplier(
  materialType: unknown,
  overrides?: CompanyPricingModifiers | null,
): number {
  const normalized = String(materialType ?? 'pal')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');

  if (normalized === 'hpl') return resolvePricingModifierFactor('mobila.materialType.hpl', overrides);
  if (normalized === 'lemn') return resolvePricingModifierFactor('mobila.materialType.lemn', overrides);
  if (normalized === 'mdf') return resolvePricingModifierFactor('mobila.materialType.mdf', overrides);
  return 1.0;
}

function resolveMaterialThicknessMultiplier(thickness: unknown): number {
  const normalized = String(thickness ?? '16 mm').trim().toLowerCase();
  if (normalized.includes('25')) return 1.25;
  if (normalized.includes('22')) return 1.15;
  if (normalized.includes('18')) return 1.05;
  return 1.0;
}

function resolveFinishMultiplier(finishType: unknown): number {
  const normalized = String(finishType ?? 'Mat')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');

  if (normalized.includes('vopsit')) return 1.3;
  if (normalized.includes('hpl')) return 1.25;
  if (normalized.includes('lucios')) return 1.1;
  if (normalized.includes('texturat')) return 1.08;
  return 1.0;
}

function resolveAssemblyComplexityMultiplier(complexity: unknown): number {
  const normalized = String(complexity ?? 'Simplu')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');

  if (normalized.includes('complex')) return 1.4;
  if (normalized.includes('mediu')) return 1.2;
  return 1.0;
}

export function deriveMobilaMeasurements(
  plan2d: Plan2dData | null | undefined,
  diagnostic: Record<string, unknown> | null | undefined,
  base: MeasurementMap,
  overrides?: CompanyPricingModifiers | null,
): MeasurementMap {
  const measurements: MeasurementMap = { ...base };
  const pointsCount = (type: string) => plan2d?.points?.filter((point) => point.type === type).length ?? 0;

  const planCabinetCount = pointsCount('kitchen_cabinet') + pointsCount('table');
  const planWardrobeCount = pointsCount('wardrobe') + pointsCount('bed');

  measurements.cabinetCount = Math.max(
    0,
    readNumber(diagnostic, 'cabinetCount') ?? (planCabinetCount > 0 ? planCabinetCount : 0),
  );
  measurements.wardrobeCount = Math.max(
    0,
    readNumber(diagnostic, 'wardrobeCount') ?? (planWardrobeCount > 0 ? planWardrobeCount : 0),
  );

  const manualLinearMeters = readNumber(diagnostic, 'linearMeters');
  measurements.linearMeters =
    manualLinearMeters ??
    round2(measurements.cabinetCount * 0.8 + measurements.wardrobeCount * 1.5);
  measurements.cuttingLinearM = measurements.linearMeters;

  const carcassMaterialMultiplier = resolveMaterialMultiplier(diagnostic?.materialType, overrides);
  const frontMaterialMultiplier = resolveMaterialMultiplier(diagnostic?.frontMaterialType, overrides);
  const materialThicknessMultiplier = resolveMaterialThicknessMultiplier(diagnostic?.materialThickness);
  const finishMultiplier = resolveFinishMultiplier(diagnostic?.finishType);
  const materialMultiplier = round2(
    Math.max(carcassMaterialMultiplier, frontMaterialMultiplier) *
    materialThicknessMultiplier *
    finishMultiplier,
  );
  measurements.materialMultiplier = materialMultiplier;
  measurements.cuttingMaterialPremiumM =
    materialMultiplier > 1 ? round2(measurements.cuttingLinearM * (materialMultiplier - 1)) : 0;

  measurements.drawerCount = readNumber(diagnostic, 'drawerCount') ?? measurements.cabinetCount * 2;
  measurements.hingeCount =
    readNumber(diagnostic, 'hingeCount') ?? measurements.cabinetCount * 4 + measurements.wardrobeCount * 6;

  const softCloseMultiplier = readBoolean(diagnostic, 'softClose') ? 1.1 : 1.0;
  const hardwareCostMultiplier = round2(
    resolveHardwareCostMultiplier(diagnostic?.hardwareTier, overrides) * softCloseMultiplier,
  );
  measurements.hardwareCostMultiplier = hardwareCostMultiplier;
  measurements.hardwareUnits = measurements.hingeCount + measurements.drawerCount;
  measurements.hardwareCostQty = round2(measurements.hardwareUnits * hardwareCostMultiplier);

  measurements.countertopLengthM = readNumber(diagnostic, 'countertopLengthM') ?? 0;
  measurements.applianceCutoutUnits = readBoolean(diagnostic, 'hasApplianceCutouts') ? 2 : 0;

  const deliveryRequired = readBoolean(diagnostic, 'deliveryRequired');
  const installationRequired = readBoolean(diagnostic, 'installationRequired');
  measurements.deliveryQty = deliveryRequired ? 1 : 0;
  measurements.installationQty = installationRequired
    ? measurements.cabinetCount + measurements.wardrobeCount
    : 0;

  measurements.designHours = measurements.cabinetCount + measurements.wardrobeCount > 0 ? 4 : 0;
  measurements.assemblyComplexityMultiplier = resolveAssemblyComplexityMultiplier(diagnostic?.assemblyComplexity);
  measurements.assemblyCabinetQty = round2(measurements.cabinetCount * measurements.assemblyComplexityMultiplier);
  measurements.assemblyWardrobeQty = round2(measurements.wardrobeCount * measurements.assemblyComplexityMultiplier);
  measurements.handoverUnits =
    measurements.cabinetCount + measurements.wardrobeCount > 0 ? 1 : 0;

  return measurements;
}
