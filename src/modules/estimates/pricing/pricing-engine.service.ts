import { Injectable } from '@nestjs/common';
import type { EstimateBlueprintConfig, BlueprintPricingRule } from './pricing.types';
import type { Plan2dData } from './plan2d.types';
import { isPricingRuleActive, getDefaultEnabledWorkModules } from '../utils/work-modules.util';
import {
  round2,
  applyBaseMeasurementFallbacks,
  normalizeRateKey,
  readOptionalPositiveNumber,
  normalizeRoomLayout,
  pointPositionInRoom,
  CUSTOM_PRICING_KEYS,
  ROOM_COLORS,
} from './pricing-engine-utils';
import { getCategoryStrategy } from './category/category-measurement.registry';
import type { CompanyPricingModifiers } from '../../../../prisma/estimate-pricing-modifiers';
import { isEstimateServiceCategorySlug } from '../../../common/constants/estimate-category-slugs.constants';

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

    // Strategy + Registry: delegate to category-specific measurement logic
    if (categorySlug) {
      const strategy = getCategoryStrategy(categorySlug);
      if (strategy) {
        return strategy.deriveMeasurements(plan2d, diagnosticAnswers, measurements, pricingModifiers);
      }
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
      laborMultiplier?: number;
      materialMultiplier?: number;
      includeMaterials?: boolean;
      diagnostic?: Record<string, unknown> | null;
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
    const includeMaterials = options?.includeMaterials ?? true;

    for (const rule of rules) {
      if (!includeMaterials && (rule.kind ?? 'material') === 'material') {
        continue;
      }

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
      const ruleLaborMult =
        kind === 'labor' && rule.laborUnitPriceMultiplierKey
          ? (measurements[rule.laborUnitPriceMultiplierKey] ?? 1)
          : 1;
      const ruleMaterialMult =
        kind === 'material' && rule.materialUnitPriceMultiplierKey
          ? (measurements[rule.materialUnitPriceMultiplierKey] ?? 1)
          : 1;
      const mult = kind === 'labor' ? laborMult * ruleLaborMult : materialMult * ruleMaterialMult;
      const unitPrice = round2(rule.unitPrice * mult);
      const lineTotal = round2(qty * unitPrice);

      let description = rule.description;
      if (rule.qtyKey === 'scaffoldingRentalArea') {
        const scaffoldingArea = measurements.scaffoldingArea ?? measurements.facadeArea ?? 0;
        const duration = Number(options?.diagnostic?.scaffoldingRentalDuration ?? 1);
        const period = String(options?.diagnostic?.scaffoldingRentalPeriod ?? 'months').toLowerCase();
        
        let durationInMonths = duration;
        let label = 'luni';
        if (period === 'days') {
          durationInMonths = duration / 30;
          label = `zile (${round2(durationInMonths)} luni)`;
        } else if (period === 'weeks') {
          durationInMonths = (duration * 7) / 30;
          label = `săpt. (${round2(durationInMonths)} luni)`;
        } else {
          label = duration === 1 ? 'lună' : 'luni';
        }
        const formattedDuration = duration === 1 && period === 'months' ? '1 lună' : `${duration} ${label}`;
        description = `Închiriere schelă (${scaffoldingArea} m² × ${formattedDuration})`;
      }

      lines.push({
        stageCode: rule.stageCode,
        description,
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

    const getMatchCountInBlueprint = (name: string): number => {
      let count = 0;
      for (const rule of rules) {
        const ruleKey = normalizeRateKey(rule.description);
        if (ruleKey.includes(name) || name.includes(ruleKey)) {
          count++;
        }
      }
      return count;
    };

    return rules.map((rule) => {
      const ruleKey = normalizeRateKey(rule.description);
      const direct = priceByName.get(ruleKey);
      if (direct != null) {
        return { ...rule, unitPrice: direct };
      }

      for (const [name, price] of priceByName) {
        if (ruleKey.includes(name) || name.includes(ruleKey)) {
          if (getMatchCountInBlueprint(name) === 1) {
            return { ...rule, unitPrice: price };
          }
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
      const isServiceCategory = isEstimateServiceCategorySlug(categorySlug);

      if (isServiceCategory) {
        const hourlyLaborRules = nextRules.filter((rule) => rule.unit === 'ore' && rule.kind === 'labor');
        if (hourlyLaborRules.length) {
          nextRules = nextRules.map((rule) =>
            rule.unit === 'ore' && rule.kind === 'labor'
              ? { ...rule, unitPrice: customUnitPriceSqm }
              : rule,
          );
        }
      } else {
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

