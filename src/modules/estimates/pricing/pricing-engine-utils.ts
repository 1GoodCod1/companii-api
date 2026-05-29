import type { Plan2dData } from './plan2d.types';

export type MeasurementMap = Record<string, number>;

export type LayoutRoom = Plan2dData['rooms'][number] & { layoutX: number; layoutY: number };

export const ROOM_COLORS = ['#6366f1', '#2563eb', '#16a34a', '#d97706', '#dc2626', '#ea580c'];
export const ROOM_GAP_M = 0.6;

export const CUSTOM_PRICING_KEYS = {
  unitPriceSqm: 'customUnitPriceSqm',
  durationDays: 'customDurationDays',
  laborHours: 'customLaborHours',
  laborTotal: 'customLaborTotal',
} as const;

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function applyBaseMeasurementFallbacks(measurements: MeasurementMap): void {
  if (measurements.totalFloorArea != null && measurements.totalFloorArea > 0) {
    measurements.wallArea ??= round2(measurements.totalFloorArea * 2.5);
  }
}

export function normalizeRateKey(value: string): string {
  return value.trim().toLowerCase();
}

export function readOptionalPositiveNumber(
  diagnostic: Record<string, unknown> | null | undefined,
  key: string,
): number | undefined {
  const value = diagnostic?.[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  return value;
}

export function distributeDurationDays(
  totalDays: number,
  stages: Array<{ id: string; durationDays: number | null }>,
): Array<{ id: string; durationDays: number }> {
  if (!stages.length) return [];

  const weights = stages.map((stage) => Math.max(1, stage.durationDays ?? 1));
  const weightSum = weights.reduce((acc, value) => acc + value, 0);
  let assigned = 0;

  return stages.map((stage, index) => {
    if (index === stages.length - 1) {
      return { id: stage.id, durationDays: Math.max(1, totalDays - assigned) };
    }

    const days = Math.max(1, Math.round((totalDays * weights[index]!) / weightSum));
    assigned += days;
    return { id: stage.id, durationDays: days };
  });
}

export function normalizeRoomLayout(rooms: Plan2dData['rooms']): LayoutRoom[] {
  let cursorX = 0;
  return rooms.map((room) => {
    const layoutX = room.x ?? cursorX;
    const layoutY = room.y ?? 0;
    cursorX = Math.max(cursorX, layoutX + room.width + ROOM_GAP_M);
    return { ...room, layoutX, layoutY };
  });
}

export function pointPositionInRoom(
  room: LayoutRoom,
  point: Plan2dData['points'][number],
  indexInRoom: number,
): { x: number; y: number } {
  if (point.x != null && point.y != null) {
    return {
      x: room.layoutX + point.x * room.width,
      y: room.layoutY + point.y * room.height,
    };
  }

  const cols = Math.max(2, Math.ceil(Math.sqrt(indexInRoom + 1)));
  const col = indexInRoom % cols;
  const row = Math.floor(indexInRoom / cols);
  return {
    x: room.layoutX + 0.35 + col * 0.55,
    y: room.layoutY + 0.35 + row * 0.55,
  };
}
