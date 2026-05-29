import { Injectable } from '@nestjs/common';
import type { EstimateBlueprintConfig, BlueprintPricingRule } from './pricing.types';
import type { Plan2dData } from './plan2d.types';
import { isPricingRuleActive, getDefaultEnabledWorkModules } from '../utils/work-modules.util';
import { deriveSantehnikaMeasurements } from './category/plumbing/plumbing-measurements.util';
import { deriveElektrikaMeasurements } from './category/electrical/electrical-measurements.util';
import { deriveClimaMeasurements } from './category/climate/climate-measurements.util';
import { deriveFinisajMeasurements } from './category/finishing/finishing-measurements.util';
import { deriveAcoperisMeasurements } from './category/roofing/roofing-measurements.util';
import { deriveFlatRoofMeasurements } from './category/flat-roofing/flat-roofing-measurements.util';
import { deriveFatadeMeasurements } from './category/facade/facade-measurements.util';
import { deriveOknaDveriMeasurements } from './category/windows-doors/windows-doors-measurements.util';
import { deriveMobilaMeasurements } from './category/furniture/furniture-measurements.util';
import { deriveCleaningMeasurements } from './category/cleaning/cleaning-measurements.util';
import { deriveItNetworksMeasurements } from './category/it-networks/it-networks-measurements.util';
import { deriveItHardwareMeasurements } from './category/it-hardware/it-hardware-measurements.util';
import { derivePanouriSolareMeasurements } from './category/solar/solar-measurements.util';
import { deriveConstructiiMeasurements } from './category/constructii/constructii-measurements.util';
import { derivePavajMeasurements } from './category/pavaj/pavaj-measurements.util';

export type { Plan2dData } from './plan2d.types';

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
    categorySlug?: string | null,
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

    applyBaseMeasurementFallbacks(measurements);

    if (categorySlug === 'santehnika') {
      return deriveSantehnikaMeasurements(plan2d, diagnosticAnswers, measurements);
    }

    if (categorySlug === 'elektrika') {
      return deriveElektrikaMeasurements(plan2d, diagnosticAnswers, measurements);
    }

    if (categorySlug === 'clima') {
      return deriveClimaMeasurements(plan2d, diagnosticAnswers, measurements);
    }

    if (categorySlug === 'lucrari-finisaj') {
      return deriveFinisajMeasurements(plan2d, diagnosticAnswers, measurements);
    }

    if (categorySlug === 'acoperis') {
      return deriveAcoperisMeasurements(plan2d, diagnosticAnswers, measurements);
    }

    if (categorySlug === 'acoperis-plat') {
      return deriveFlatRoofMeasurements(plan2d, diagnosticAnswers, measurements);
    }

    if (categorySlug === 'fatade') {
      return deriveFatadeMeasurements(plan2d, diagnosticAnswers, measurements);
    }

    if (categorySlug === 'okna-dveri') {
      return deriveOknaDveriMeasurements(plan2d, diagnosticAnswers, measurements);
    }

    if (categorySlug === 'mobila') {
      return deriveMobilaMeasurements(plan2d, diagnosticAnswers, measurements);
    }

    if (categorySlug === 'cleaning') {
      return deriveCleaningMeasurements(plan2d, diagnosticAnswers, measurements);
    }

    if (categorySlug === 'it-networks') {
      return deriveItNetworksMeasurements(plan2d, diagnosticAnswers, measurements);
    }

    if (categorySlug === 'it-hardware') {
      return deriveItHardwareMeasurements(plan2d, diagnosticAnswers, measurements);
    }

    if (categorySlug === 'panouri-solare') {
      return derivePanouriSolareMeasurements(plan2d, diagnosticAnswers, measurements);
    }

    if (categorySlug === 'constructii') {
      return deriveConstructiiMeasurements(plan2d, diagnosticAnswers, measurements);
    }

    if (categorySlug === 'pavaj') {
      return derivePavajMeasurements(plan2d, diagnosticAnswers, measurements);
    }

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
    options?: {
      enabledWorkModules?: string[];
      config?: EstimateBlueprintConfig;
      /**
       * Composed labor unitPrice multiplier (Slice 2+3 — access × urgency × future).
       * Caller is responsible for composition. Defaults to 1.0.
       */
      laborMultiplier?: number;
      /** Composed material unitPrice multiplier (rare — only when transport risk). */
      materialMultiplier?: number;
    },
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

    const laborMult = options?.laborMultiplier ?? 1;
    const materialMult = options?.materialMultiplier ?? 1;

    for (const rule of rules) {
      if (options?.config?.workModules?.length) {
        const enabledModules =
          options.enabledWorkModules ?? getDefaultEnabledWorkModules(options.config);
        if (!isPricingRuleActive(rule, enabledModules, measurements, options.config)) {
          continue;
        }
      }

      const rawQty = measurements[rule.qtyKey] ?? 0;
      if (rawQty <= 0) continue;

      const waste = rule.wastePct ? 1 + rule.wastePct / 100 : 1;
      const qty = round2(rawQty * waste);
      const kind = rule.kind ?? 'material';
      const mult = kind === 'labor' ? laborMult : materialMult;
      const unitPrice = round2(rule.unitPrice * mult);
      const lineTotal = round2(qty * unitPrice);
      lines.push({
        stageCode: rule.stageCode,
        description: rule.description,
        qty,
        unit: rule.unit,
        unitPrice,
        lineTotal,
        source: 'rule',
        kind,
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
    categorySlug?: string | null,
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
      const isServiceCategory = categorySlug === 'it-networks' || categorySlug === 'it-hardware';

      if (isServiceCategory) {
        // IT/networks: override ore-based labor rules
        const hourlyLaborRules = nextRules.filter((rule) => rule.unit === 'ore' && rule.kind === 'labor');
        if (hourlyLaborRules.length) {
          nextRules = nextRules.map((rule) =>
            rule.unit === 'ore' && rule.kind === 'labor'
              ? { ...rule, unitPrice: customUnitPriceSqm }
              : rule,
          );
        }
      } else {
        // Construction categories: override m²-based labor rules
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
            description: 'Cost Lucrări personalizat / m²',
            unit: 'm²',
            qtyKey: 'totalFloorArea',
            unitPrice: customUnitPriceSqm,
            kind: 'labor',
          });
        }
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
          description: 'Cost Lucrări personalizat',
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

/** E-01: only base plan metrics get global fallbacks; optional qty keys belong to category hooks. */
function applyBaseMeasurementFallbacks(measurements: MeasurementMap): void {
  if (measurements.totalFloorArea != null && measurements.totalFloorArea > 0) {
    measurements.wallArea ??= round2(measurements.totalFloorArea * 2.5);
  }
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
