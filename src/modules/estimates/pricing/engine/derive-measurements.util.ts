import type { CompanyPricingModifiers } from '../../../../../prisma/estimate-pricing-modifiers';
import { getCategoryStrategy } from '../category/category-measurement.registry';
import type { Plan2dData } from '../plan2d/plan2d.types';
import { round2 } from '../shared/pricing-shared.util';
import type { MeasurementMap } from './pricing-engine.types';

function applyBaseMeasurementFallbacks(measurements: MeasurementMap): void {
  if (measurements.totalFloorArea != null && measurements.totalFloorArea > 0) {
    measurements.wallArea ??= round2(measurements.totalFloorArea * 2.5);
  }
}

export function deriveMeasurements(
  plan2d: Plan2dData | null | undefined,
  diagnosticAnswers: Record<string, unknown> | null | undefined,
  categorySlug?: string | null,
  pricingModifiers?: CompanyPricingModifiers | null,
): MeasurementMap {
  const measurements: MeasurementMap = {};
  const pointsCount = (type: string) => plan2d?.points?.filter((p) => p.type === type).length ?? 0;

  const globalParams = plan2d?.globalParameters;
  if (globalParams) {
    if (typeof globalParams.baseArea === 'number' && Number.isFinite(globalParams.baseArea)) {
      measurements.baseArea = globalParams.baseArea;
    }
    if (typeof globalParams.wallHeight === 'number' && Number.isFinite(globalParams.wallHeight)) {
      measurements.wallHeight = globalParams.wallHeight;
    }
    if (typeof globalParams.floorsCount === 'number' && Number.isFinite(globalParams.floorsCount)) {
      measurements.storyCount = globalParams.floorsCount;
    }
    if (typeof globalParams.roofSlope === 'number' && Number.isFinite(globalParams.roofSlope)) {
      measurements.roofSlope = globalParams.roofSlope;
    }
    if (typeof globalParams.facadeArea === 'number' && Number.isFinite(globalParams.facadeArea)) {
      measurements.facadeArea = globalParams.facadeArea;
      measurements.scaffoldingArea = globalParams.facadeArea;
    }
  }

  if (plan2d?.rooms?.length) {
    let floorArea = 0;
    for (const room of plan2d.rooms) {
      floorArea += room.width * room.height;
    }
    measurements.totalFloorArea = round2(floorArea);
    measurements.roomCount = plan2d.rooms.length;
  }

  if (plan2d?.points?.length) {
    measurements.plumbingPoints =
      pointsCount('water') + pointsCount('drain') + pointsCount('mixer') + pointsCount('toilet');

    measurements.electricPoints =
      pointsCount('socket') + pointsCount('switch') + pointsCount('light');
    measurements.panelCount = pointsCount('panel');

    measurements.acUnits = pointsCount('indoor') + pointsCount('outdoor');
    if (pointsCount('indoor')) {
      measurements.acUnits = pointsCount('indoor');
    }

    measurements.networkPoints = pointsCount('ethernet');
    measurements.apCount = pointsCount('ap');
    measurements.cameraCount = pointsCount('camera');
    measurements.rackCount = pointsCount('rack');

    measurements.panelCount = pointsCount('solar_panel');
    measurements.inverterCount = pointsCount('inverter');
    measurements.batteryCount = pointsCount('battery');

    measurements.windowCount = pointsCount('window');
    measurements.doorCount = pointsCount('door') + pointsCount('sliding_door');

    measurements.cabinetCount = pointsCount('kitchen_cabinet') + pointsCount('table');
    measurements.wardrobeCount = pointsCount('wardrobe') + pointsCount('bed');
  }

  if (diagnosticAnswers && typeof diagnosticAnswers === 'object') {
    for (const [key, value] of Object.entries(diagnosticAnswers)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        measurements[key] = value;
      }
    }
  }

  applyBaseMeasurementFallbacks(measurements);

  if (categorySlug) {
    const strategy = getCategoryStrategy(categorySlug);
    if (strategy) {
      return strategy.deriveMeasurements(plan2d, diagnosticAnswers, measurements, pricingModifiers);
    }
  }

  return measurements;
}
