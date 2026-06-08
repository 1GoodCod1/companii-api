import { EstimatePricingEngine } from '../../pricing-engine.service';
import { deriveItWebMeasurements, resolveAnalysisHours } from './it-web-measurements.util';
import type { EstimateBlueprintConfig } from '../../../../../../prisma/estimate-blueprint-config.types';
import { itWebBlueprint } from '../../../../../../prisma/estimate-blueprints/categories/it-web.blueprint';

describe('IT web measurements (it-web)', () => {
  it('computes page counts, design/front page overrides and software hours baseline', () => {
    const result = deriveItWebMeasurements(
      null,
      {
        pagesCount: 10,
        backendComplexity: 'Mediu (API REST + 3rd party)',
        hasCMS: true,
        hasEcommerce: false,
        documentationRequired: true,
        slaRequired: true,
        projectScope: 'Mediu (6-20 pagini / 1-2 săptămâni)',
        customDesign: true,
      },
      {},
    );

    expect(result.pagesCount).toBe(10);
    expect(result.hasBackendCount).toBe(1);
    expect(result.backendComplexityMultiplier).toBe(2);
    expect(result.hasCmsCount).toBe(1);
    expect(result.hasEcommerceCount).toBe(0);
    expect(result.analysisHours).toBe(16);
    expect(result.testingHours).toBe(8);
    expect(result.trainingHours).toBe(6);
    expect(result.slaUnits).toBe(1);
  });

  it('correctly builds design and frontend lines for it-web', () => {
    const engine = new EstimatePricingEngine();
    const measurements = deriveItWebMeasurements(
      null,
      {
        pagesCount: 5,
        projectScope: 'Mic (1-5 pagini / 1-2 zile)',
        customDesign: true,
      },
      {},
    );

    const lines = engine.buildLinesFromRules(itWebBlueprint.pricingRules, measurements, {
      enabledWorkModules: ['web_design', 'frontend'],
      config: itWebBlueprint as EstimateBlueprintConfig,
    });

    const descriptions = lines.map((line) => line.description.toLowerCase());
    expect(descriptions.some((d) => d.includes('design ui/ux'))).toBe(true);
    expect(descriptions.some((d) => d.includes('dezvoltare frontend'))).toBe(true);
    expect(descriptions.some((d) => d.includes('cablare'))).toBe(false);
  });
});
