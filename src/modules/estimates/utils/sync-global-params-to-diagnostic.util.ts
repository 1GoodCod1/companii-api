import type { Plan2dData, Plan2dGlobalParameters, Plan2dWorkContext } from '../pricing/plan2d.types';
import { ENABLED_WORK_MODULES_KEY } from './work-modules.util';

export function syncGlobalParamsToDiagnostic(
  plan: Plan2dData,
  currentDiag: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...currentDiag };
  const params: Partial<Plan2dGlobalParameters> = plan.globalParameters ?? {};
  const ctx: Plan2dWorkContext = params.workContext ?? 'general';

  if (params.baseArea != null) {
    next.baseArea = params.baseArea;
    applyBaseAreaForContext(next, ctx, params.baseArea);
  }
  if (params.wallHeight != null) {
    next.wallHeight = params.wallHeight;
  }
  if (params.floorsCount != null) {
    next.storyCount = params.floorsCount;
  }
  if (params.roofSlope != null && ctx === 'roof') {
    next.roofSlope = params.roofSlope;
  }
  if (ctx === 'roof') {
    for (const key of [
      'coveringType',
      'membraneType',
      'insulationThicknessMm',
      'buildingHeightM',
      'scaffoldingRequired',
      'snowGuardLengthM',
      'snowGuardRows',
      'roofOverhangM',
    ] as const) {
      const value = params[key];
      if (value !== undefined) next[key] = value;
    }
  }
  if (params.facadeArea != null && ctx === 'facade') {
    next.facadeArea = params.facadeArea;
    next.scaffoldingArea = params.facadeArea;
  }

  if (plan.rooms?.length) {
    const totalArea = plan.rooms.reduce((acc, r) => acc + r.width * r.height, 0);
    next.totalFloorArea = totalArea;
    next.roomCount = plan.rooms.length;
    applyBaseAreaForContext(next, ctx, totalArea, { onlyIfMissing: true });
  }

  const pointsCount = (type: string) => plan.points?.filter((p) => p.type === type).length ?? 0;

  const splitCount = pointsCount('indoor');
  if (splitCount > 0) next.acUnits = splitCount;
  const routeCount = pointsCount('route');
  if (routeCount > 0) next.routeLengthM = routeCount * 5;

  const windowCount = pointsCount('window');
  if (windowCount > 0) next.windowCount = windowCount;
  const doorCount = pointsCount('door') + pointsCount('sliding_door');
  if (doorCount > 0) next.doorCount = doorCount;

  const cabinetCount = pointsCount('kitchen_cabinet') + pointsCount('table');
  if (cabinetCount > 0) next.cabinetCount = cabinetCount;
  const wardrobeCount = pointsCount('wardrobe') + pointsCount('bed');
  if (wardrobeCount > 0) next.wardrobeCount = wardrobeCount;

  // Elektrika
  const elekSocketCount = pointsCount('socket');
  if (elekSocketCount > 0) next.socketCount = elekSocketCount;
  const elekSwitchCount = pointsCount('switch');
  if (elekSwitchCount > 0) next.switchCount = elekSwitchCount;
  const elekLightCount = pointsCount('light');
  if (elekLightCount > 0) next.lightPointCount = elekLightCount;
  const elekPanelCount = pointsCount('panel');
  if (elekPanelCount > 0) next.panelCount = elekPanelCount;
  const junctionBoxCount = pointsCount('junction_box');
  if (junctionBoxCount > 0) next.junctionBoxCount = junctionBoxCount;
  const dedicatedLinePoints = pointsCount('dedicated_line');
  if (dedicatedLinePoints > 0) next.dedicatedLinesCount = dedicatedLinePoints;

  // Santehnika
  const waterPoints = pointsCount('water');
  const drainPlanPoints = pointsCount('drain');
  const mixerPoints = pointsCount('mixer');
  const toiletPoints = pointsCount('toilet');
  if (waterPoints > 0) next.bathroomPoints = waterPoints;
  if (drainPlanPoints > 0) next.drainPlanPoints = drainPlanPoints;
  if (mixerPoints > 0) next.mixerCount = mixerPoints;
  if (toiletPoints > 0) next.toiletCount = toiletPoints;

  const cleanWindows = pointsCount('window_clean');
  if (cleanWindows > 0) next.windowCount = cleanWindows;

  const netPoints = pointsCount('ethernet');
  if (netPoints > 0) next.networkPoints = netPoints;
  const apPoints = pointsCount('ap');
  if (apPoints > 0) next.apCount = apPoints;
  const camPoints = pointsCount('camera');
  if (camPoints > 0) next.cameraCount = camPoints;

  const panelPoints = pointsCount('solar_panel');
  if (panelPoints > 0) next.panelCount = panelPoints;

  if (ctx === 'roof') {
    const effectiveBaseArea = Number(params.baseArea ?? next.baseArea ?? next.totalFloorArea ?? 0);
    const roofShape = inferRoofShapeFromRooms(plan);
    next.roofShape = roofShape;
    next.roofOverhangM = Number(params.roofOverhangM ?? next.roofOverhangM ?? 0.4);
    if (effectiveBaseArea > 0) {
      const primaryRoom = plan.rooms[0];
      const ridgeLengthM = primaryRoom
        ? computeRidgeLength(primaryRoom.width, primaryRoom.height, primaryRoom.roofType, Number(next.roofOverhangM))
        : round2(Math.sqrt(effectiveBaseArea) * 2);
      const gutterLengthM = Number(params.roofGutterLengthM ?? next.gutterLengthM ?? 0) > 0
        ? Number(params.roofGutterLengthM ?? next.gutterLengthM)
        : primaryRoom
          ? computeRoofPerimeter(primaryRoom.width, primaryRoom.height, Number(next.roofOverhangM))
          : round2(Math.sqrt(effectiveBaseArea) * 4);
      next.ridgeLengthM = ridgeLengthM;
      next.gutterLengthM = gutterLengthM;
      next.roofDripEdgeLengthM = gutterLengthM;
      next.valleyLengthM = deriveValleyLengthFromShape(roofShape);
      next.wallIntersectionLengthM = plan.rooms.length > 1 ? 8 : 0;
    }
    const chimneyPoints = pointsCount('chimney');
    next.chimneyCount = chimneyPoints;
    const skylightPoints = pointsCount('skylight');
    next.skylightCount = skylightPoints;
  }

  const borderPoints = pointsCount('border');
  if (borderPoints > 0) next.borderLengthM = borderPoints * 8;

  // Fațadă: glafuri ferestre (≈ 1.8 m perimetru per fereastră standard).
  // Auto-fill only if the user hasn't set a value yet — preserves manual override.
  if (ctx === 'facade') {
    const windowSlopePoints = pointsCount('window_slope');
    if (windowSlopePoints > 0 && (next.windowSlopeLengthM == null || next.windowSlopeLengthM === 0)) {
      next.windowSlopeLengthM = windowSlopePoints * 1.8;
    }
  }

  // I-03 invariant: sync must not toggle work modules from plan data.
  if (next[ENABLED_WORK_MODULES_KEY] !== currentDiag[ENABLED_WORK_MODULES_KEY]) {
    next[ENABLED_WORK_MODULES_KEY] = currentDiag[ENABLED_WORK_MODULES_KEY];
  }

  return next;
}

function normalizeRoofShape(shape: unknown): string {
  return String(shape ?? 'rectangle').trim().toLowerCase().replace(/_/g, '-');
}

function inferRoofShapeFromRooms(plan: Plan2dData): string {
  if (!plan.rooms?.length) return 'rectangle';
  if (plan.rooms.length > 1) return 'complex';

  const shape = normalizeRoofShape(plan.rooms[0]?.shapeType);
  if (shape === 'l-shape' || shape === 't-shape' || shape === 'u-shape') return shape;
  return 'rectangle';
}

function deriveValleyLengthFromShape(shape: string): number {
  if (shape === 'l-shape') return 12;
  if (shape === 't-shape' || shape === 'u-shape') return 18;
  if (shape === 'complex') return 24;
  return 0;
}

function computeRoofPerimeter(width: number, length: number, overhangM: number): number {
  return round2(2 * Math.max(0, width + overhangM * 2) + 2 * Math.max(0, length + overhangM * 2));
}

function computeRidgeLength(width: number, length: number, roofType: unknown, overhangM: number): number {
  const normalizedRoofType = String(roofType ?? 'gable').trim().toLowerCase();
  if (normalizedRoofType === 'flat') return 0;
  const effectiveWidth = Math.max(0, width + overhangM * 2);
  const effectiveLength = Math.max(0, length + overhangM * 2);
  if (normalizedRoofType === 'hip') return round2(Math.max(0, effectiveLength - effectiveWidth));
  return round2(Math.max(effectiveWidth, effectiveLength));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function applyBaseAreaForContext(
  target: Record<string, unknown>,
  ctx: Plan2dWorkContext,
  area: number,
  options: { onlyIfMissing?: boolean } = {},
) {
  const set = (key: string) => {
    if (options.onlyIfMissing && target[key] != null) return;
    target[key] = area;
  };

  switch (ctx) {
    case 'roof':
      set('roofArea');
      break;
    case 'facade':
      // facadeArea приходит отдельно через params.facadeArea
      break;
    case 'indoor':
      set('finishArea');
      set('cleanArea');
      break;
    case 'general':
    default:
      set('builtArea');
      set('pavementArea');
      break;
  }
}
