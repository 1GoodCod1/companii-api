import type { Plan2dData } from './plan2d.types';

export type LayoutRoom = Plan2dData['rooms'][number] & { layoutX: number; layoutY: number };

export const ROOM_COLORS = ['#6366f1', '#2563eb', '#16a34a', '#d97706', '#dc2626', '#ea580c'];
export const ROOM_GAP_M = 0.6;

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
