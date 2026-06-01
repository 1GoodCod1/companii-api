import type { Plan2dData } from './plan2d.types';
import { normalizeRoomLayout, pointPositionInRoom, ROOM_COLORS } from './room-layout.util';

export function buildPlan3dPreview(plan2d: Plan2dData | null | undefined) {
  if (!plan2d?.rooms?.length) return null;

  const layout = normalizeRoomLayout(plan2d.rooms);

  return {
    rooms: layout.map((room, index) => ({
      id: room.id,
      name: room.name,
      width: room.width,
      depth: room.height,
      height: 2.7,
      x: room.layoutX,
      z: room.layoutY,
      color: ROOM_COLORS[index % ROOM_COLORS.length],
    })),
    points: plan2d.points.map((point) => {
      const room = layout.find((item) => item.id === point.roomId);
      const roomPoints = plan2d.points.filter((item) => item.roomId === point.roomId);
      const indexInRoom = roomPoints.findIndex((item) => item.id === point.id);
      const position = room
        ? pointPositionInRoom(room, point, Math.max(0, indexInRoom))
        : { x: 0.5, y: 0.5 };
      return {
        ...point,
        x: position.x,
        z: position.y,
        elevation: 1.05,
      };
    }),
  };
}
