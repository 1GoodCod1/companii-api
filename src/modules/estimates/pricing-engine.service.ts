import { Injectable } from '@nestjs/common';
import type { EstimateBlueprintConfig, BlueprintPricingRule } from '../../../prisma/estimate-blueprints';

export type Plan2dData = {
  rooms: Array<{
    id: string;
    name: string;
    width: number;
    height: number;
    x?: number;
    y?: number;
    unit?: string;
    shapeType?: string;
  }>;
  points: Array<{
    id: string;
    roomId?: string;
    type: string;
    label?: string;
    x?: number;
    y?: number;
  }>;
};

export type MeasurementMap = Record<string, number>;

export type CustomPricingOverrideResult = {
  measurements: MeasurementMap;
  rules: BlueprintPricingRule[];
  customDurationDays?: number;
  customLaborHours?: number;
  customLaborTotal?: number;
};

@Injectable()
export class EstimatePricingEngine {
  deriveMeasurements(
    plan2d: Plan2dData | null | undefined,
    diagnosticAnswers: Record<string, unknown> | null | undefined,
  ): MeasurementMap {
    const measurements: MeasurementMap = {};
    const pointsCount = (type: string) => plan2d?.points?.filter((p) => p.type === type).length ?? 0;

    if (plan2d?.rooms?.length) {
      let floorArea = 0;
      for (const room of plan2d.rooms) {
        floorArea += room.width * room.height;
      }
      measurements.totalFloorArea = round2(floorArea);
      measurements.roomCount = plan2d.rooms.length;
    }

    if (plan2d?.points?.length) {
      // 1. Instalații sanitare (Plumbing)
      measurements.plumbingPoints =
        pointsCount('water') + pointsCount('drain') + pointsCount('mixer') + pointsCount('toilet');

      // 2. Electricitate (Electrical)
      measurements.electricPoints =
        pointsCount('socket') + pointsCount('switch') + pointsCount('light');
      measurements.panelCount = pointsCount('panel');

      // 3. Climatizare (Clima)
      measurements.acUnits = pointsCount('indoor') + pointsCount('outdoor');
      if (pointsCount('indoor')) {
        measurements.acUnits = pointsCount('indoor');
      }

      // 4. Servicii IT și Securitate (IT networks & Security)
      measurements.networkPoints = pointsCount('ethernet');
      measurements.apCount = pointsCount('ap');
      measurements.cameraCount = pointsCount('camera');
      measurements.rackCount = pointsCount('rack');

      // 5. Panouri solare (Solar panels)
      measurements.panelCount = pointsCount('solar_panel');
      measurements.inverterCount = pointsCount('inverter');
      measurements.batteryCount = pointsCount('battery');

      // 6. Ferestre și uși (Windows & Doors)
      measurements.windowCount = pointsCount('window');
      measurements.doorCount = pointsCount('door') + pointsCount('sliding_door');

      // 7. Mobilier (Furniture)
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

    measurements.pipeLengthM ??= Math.max(8, (measurements.roomCount ?? 1) * 6);
    measurements.cableLengthM ??= Math.max(15, (measurements.roomCount ?? 1) * 12);
    measurements.tileFloorArea ??= measurements.totalFloorArea ?? 12;
    measurements.tileWallArea ??= Math.round((measurements.tileFloorArea ?? 12) * 2.5 * 100) / 100;
    measurements.laborHours ??= measurements.workScope ?? 4;
    measurements.materialUnits ??= Math.max(1, Math.ceil((measurements.laborHours ?? 4) / 3));
    measurements.cleanArea ??= measurements.totalFloorArea ?? 40;
    measurements.finishArea ??= measurements.totalFloorArea ?? 30;
    measurements.demolitionArea ??= 0;
    measurements.waterHeaterCount ??= 0;
    measurements.panelCount ??= 0;
    measurements.routeLengthM ??= 5;
    measurements.acUnits ??= 1;
    measurements.networkPoints ??= 0;
    measurements.apCount ??= 0;
    measurements.cameraCount ??= 0;
    measurements.rackCount ??= 0;
    measurements.windowCount ??= 0;
    measurements.doorCount ??= 0;
    measurements.cabinetCount ??= 0;
    measurements.wardrobeCount ??= 0;
    measurements.pavementArea ??= measurements.totalFloorArea ?? 20;
    measurements.borderLengthM ??= Math.max(10, (measurements.roomCount ?? 1) * 8);

    // IT Services computed measurements (from diagnostic boolean flags)
    measurements.hasBackendCount ??= 0;
    measurements.hasCmsCount ??= 0;
    measurements.hasEcommerceCount ??= 0;
    measurements.projectUnits ??= 1;
    measurements.networkCableM ??= (measurements.networkPoints ?? 0) * 20; // 20m cable per network port
    measurements.analysisHours ??= 8;
    measurements.testingHours ??= 8;
    measurements.trainingHours ??= 4;
    measurements.pagesCount ??= 0;
    measurements.serverCount ??= 0;
    measurements.workstationCount ??= 0;

    // 1. Calculate true roof area using floor area, cosine of roofSlope, and a 12% wastage/overlap factor
    const baseAreaVal = measurements.baseArea ?? measurements.totalFloorArea ?? 30;
    const slopeVal = measurements.roofSlope ?? 30; // standard default slope is 30 degrees
    const cosVal = Math.cos((slopeVal * Math.PI) / 180);
    const calculatedRoofArea = cosVal > 0.1 ? (baseAreaVal / cosVal) * 1.12 : baseAreaVal * 1.15;
    
    measurements.roofArea ??= round2(calculatedRoofArea);

    // 2. Calculate timber volume strictly in cubic meters (m³): roofArea * 0.07 (0.06 to 0.08 range)
    measurements.timberVolumeM3 ??= round2(measurements.roofArea * 0.07);

    // 3. Dynamic Roofing Complexity Multiplier (K) and Joint Elements (Valleys / Endova & Wall Flashings)
    let complexityK = 1.0;
    let computedValleys = 0;
    let computedWallIntersections = 0;

    if (plan2d?.rooms?.length) {
      if (plan2d.rooms.length > 1) {
        complexityK = 1.25; // Cascade structure (multi-level roof)
        computedWallIntersections = 8; // 8 meters standard flashing zone for low annex-to-high building
      }
      for (const room of plan2d.rooms) {
        const shape = (room.shapeType || 'rectangle').toLowerCase();
        if (shape === 'l-shape') {
          complexityK = Math.max(complexityK, 1.20);
          computedValleys = Math.max(computedValleys, 12); // L-shape valley length standard
        } else if (shape === 't-shape' || shape === 'u-shape') {
          complexityK = Math.max(complexityK, 1.35);
          computedValleys = Math.max(computedValleys, 18); // T/U-shape valley length standard
        }
      }
    }

    measurements.complexityMultiplier = complexityK;
    measurements.valleyLengthM ??= computedValleys;
    measurements.wallIntersectionLengthM ??= computedWallIntersections;

    // Apply complexity coefficient to structural labor area!
    measurements.roofAreaLabor ??= round2(measurements.roofArea * complexityK);

    measurements.gutterLengthM ??= pointsCount('gutter') * 6 || 10;
    measurements.facadeArea ??= measurements.totalFloorArea ? round2(measurements.totalFloorArea * 2.2) : 40;

    return measurements;
  }

  applyDiagnosticIncrements(
    config: EstimateBlueprintConfig,
    measurements: MeasurementMap,
    diagnosticAnswers: Record<string, unknown> | null | undefined,
  ): MeasurementMap {
    const result = { ...measurements };
    if (!diagnosticAnswers) return result;

    for (const question of config.diagnosticQuestions) {
      if (!question.affectsKey || !question.increment) continue;
      const val = diagnosticAnswers[question.key];
      if (val === true) {
        result[question.affectsKey] = (result[question.affectsKey] ?? 0) + question.increment;
      }
      if (typeof val === 'number' && question.type === 'number') {
        result[question.key] = val;
      }
    }

    return result;
  }

  buildLinesFromRules(
    rules: BlueprintPricingRule[],
    measurements: MeasurementMap,
  ): Array<{
    stageCode: string;
    description: string;
    qty: number;
    unit: string;
    unitPrice: number;
    lineTotal: number;
    source: string;
    kind: 'labor' | 'material';
  }> {
    const lines: Array<{
      stageCode: string;
      description: string;
      qty: number;
      unit: string;
      unitPrice: number;
      lineTotal: number;
      source: string;
      kind: 'labor' | 'material';
    }> = [];

    for (const rule of rules) {
      const rawQty = measurements[rule.qtyKey] ?? 0;
      if (rawQty <= 0) continue;

      const waste = rule.wastePct ? 1 + rule.wastePct / 100 : 1;
      const qty = round2(rawQty * waste);
      const lineTotal = round2(qty * rule.unitPrice);
      lines.push({
        stageCode: rule.stageCode,
        description: rule.description,
        qty,
        unit: rule.unit,
        unitPrice: rule.unitPrice,
        lineTotal,
        source: 'rule',
        kind: rule.kind ?? 'material',
      });
    }

    return lines;
  }

  applyCompanyRateBook(
    rules: BlueprintPricingRule[],
    services: Array<{ name: string; defaultPrice: number | { toString(): string } }>,
  ): BlueprintPricingRule[] {
    if (!services.length) return rules;

    const priceByName = new Map(
      services.map((service) => [normalizeRateKey(service.name), Number(service.defaultPrice)]),
    );

    return rules.map((rule) => {
      const ruleKey = normalizeRateKey(rule.description);
      const direct = priceByName.get(ruleKey);
      if (direct != null) {
        return { ...rule, unitPrice: direct };
      }

      for (const [name, price] of priceByName) {
        if (ruleKey.includes(name) || name.includes(ruleKey)) {
          return { ...rule, unitPrice: price };
        }
      }

      return rule;
    });
  }

  applyCustomPricingOverrides(
    config: EstimateBlueprintConfig,
    measurements: MeasurementMap,
    diagnosticAnswers: Record<string, unknown> | null | undefined,
    rules: BlueprintPricingRule[],
    stages: Array<{ code: string }>,
  ): CustomPricingOverrideResult {
    const customUnitPriceSqm = readOptionalPositiveNumber(
      diagnosticAnswers,
      CUSTOM_PRICING_KEYS.unitPriceSqm,
    );
    const customDurationDays = readOptionalPositiveNumber(
      diagnosticAnswers,
      CUSTOM_PRICING_KEYS.durationDays,
    );
    const customLaborHours = readOptionalPositiveNumber(
      diagnosticAnswers,
      CUSTOM_PRICING_KEYS.laborHours,
    );
    const customLaborTotal = readOptionalPositiveNumber(
      diagnosticAnswers,
      CUSTOM_PRICING_KEYS.laborTotal,
    );

    const nextMeasurements = { ...measurements };
    let nextRules = [...rules];

    if (customLaborHours) {
      nextMeasurements.laborHours = customLaborHours;
    }

    if (customUnitPriceSqm) {
      nextMeasurements.totalFloorArea ??=
        nextMeasurements.finishArea ?? nextMeasurements.cleanArea ?? nextMeasurements.tileFloorArea ?? 12;

      const sqmLaborRules = nextRules.filter((rule) => rule.unit === 'm²' && rule.kind === 'labor');
      if (sqmLaborRules.length) {
        nextRules = nextRules.map((rule) =>
          rule.unit === 'm²' && rule.kind === 'labor'
            ? { ...rule, unitPrice: customUnitPriceSqm }
            : rule,
        );
      } else {
        const stageCode =
          stages.find((stage) => stage.code === 'executie')?.code ??
          stages.find((stage) => stage.code === 'finisaj')?.code ??
          stages[0]?.code ??
          'executie';

        nextRules.push({
          stageCode,
          description: 'Manoperă personalizată / m²',
          unit: 'm²',
          qtyKey: 'totalFloorArea',
          unitPrice: customUnitPriceSqm,
          kind: 'labor',
        });
      }
    }

    if (customLaborHours) {
      const laborHourRules = nextRules.filter((rule) => rule.qtyKey === 'laborHours');
      if (!laborHourRules.length) {
        const stageCode =
          stages.find((stage) => stage.code === 'lucrari')?.code ??
          stages.find((stage) => stage.code === 'executie')?.code ??
          stages[0]?.code ??
          'executie';

        nextRules.push({
          stageCode,
          description: 'Manoperă personalizată',
          unit: 'ore',
          qtyKey: 'laborHours',
          unitPrice: config.defaultLaborRate,
          kind: 'labor',
        });
      }
    }

    return {
      measurements: nextMeasurements,
      rules: nextRules,
      customDurationDays,
      customLaborHours,
      customLaborTotal,
    };
  }

  buildPlan3dPreview(plan2d: Plan2dData | null | undefined) {
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
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeRateKey(value: string): string {
  return value.trim().toLowerCase();
}

const ROOM_COLORS = ['#6366f1', '#2563eb', '#16a34a', '#d97706', '#dc2626', '#ea580c'];
const ROOM_GAP_M = 0.6;

export const CUSTOM_PRICING_KEYS = {
  unitPriceSqm: 'customUnitPriceSqm',
  durationDays: 'customDurationDays',
  laborHours: 'customLaborHours',
  laborTotal: 'customLaborTotal',
} as const;

function readOptionalPositiveNumber(
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

type LayoutRoom = Plan2dData['rooms'][number] & { layoutX: number; layoutY: number };

function normalizeRoomLayout(rooms: Plan2dData['rooms']): LayoutRoom[] {
  let cursorX = 0;
  return rooms.map((room) => {
    const layoutX = room.x ?? cursorX;
    const layoutY = room.y ?? 0;
    cursorX = Math.max(cursorX, layoutX + room.width + ROOM_GAP_M);
    return { ...room, layoutX, layoutY };
  });
}

function pointPositionInRoom(
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
