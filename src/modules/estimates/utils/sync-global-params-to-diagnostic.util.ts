import type { Plan2dData, Plan2dGlobalParameters, Plan2dWorkContext } from '../pricing/plan2d.types';
import { ENABLED_WORK_MODULES_KEY } from './work-modules.util';

/**
 * Копирует plan2d.globalParameters и производные из комнат/точек в diagnosticAnswers.
 * Используется при saveSitePlan (backend) и на фронте перед calculate.
 *
 * **I-01/I-02 (context-aware mapping):**
 * `baseArea` теперь маппится только по `workContext`, а не во все 5 area-ключей сразу.
 *
 * **I-03 (plan не auto-enables modules):**
 * Sync **никогда** не трогает `enabledWorkModules` — модули включаются только
 * явным toggle в DiagnosticStep.
 */
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

  const gutterPoints = pointsCount('gutter');
  if (gutterPoints > 0) next.gutterLengthM = gutterPoints * 6;

  const borderPoints = pointsCount('border');
  if (borderPoints > 0) next.borderLengthM = borderPoints * 8;

  // I-03 invariant: sync must not toggle work modules from plan data.
  if (next[ENABLED_WORK_MODULES_KEY] !== currentDiag[ENABLED_WORK_MODULES_KEY]) {
    next[ENABLED_WORK_MODULES_KEY] = currentDiag[ENABLED_WORK_MODULES_KEY];
  }

  return next;
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
