/**
 * Контракт Plan2dData (backend source of truth).
 * Синхронизировать с companii-web/src/types/estimate-plan2d.types.ts (задача A-03).
 *
 * `globalParameters` хранится в plan2d JSON и дублируется в diagnosticAnswers
 * при saveSitePlan (см. syncGlobalParamsToDiagnostic) для pricing engine.
 */

export type Plan2dWorkContext = 'indoor' | 'roof' | 'facade' | 'general';

export type Plan2dRoomShapeType = 'rectangle' | 'l-shape' | 't-shape' | 'u-shape';

export type Plan2dRoofType = 'flat' | 'gable' | 'hip';

/** Глобальные параметры объекта (кровля, фасад, этажность). */
export type Plan2dGlobalParameters = {
  workContext: Plan2dWorkContext;
  baseArea?: number;
  wallHeight?: number;
  floorsCount?: number;
  roofSlope?: number;
  facadeArea?: number;
};

export type Plan2dRoom = {
  id: string;
  name: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
  unit?: string;
  shapeType?: Plan2dRoomShapeType | string;
  roofType?: Plan2dRoofType | string;
  roofPitch?: number;
  connectedRoomIds?: string[];
};

export type Plan2dPoint = {
  id: string;
  roomId?: string;
  type: string;
  label?: string;
  x?: number;
  y?: number;
  elevation?: number;
};

export type Plan2dData = {
  rooms: Plan2dRoom[];
  points: Plan2dPoint[];
  globalParameters?: Plan2dGlobalParameters;
};
