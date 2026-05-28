import { EstimatePricingEngine } from '../../pricing-engine.service';
import {
  deriveItNetworksMeasurements,
  resolveAnalysisHours,
  shouldEnablePlanWizardForItNetworks,
  shouldRequireItManualReview,
} from './it-networks-measurements.util';
import type { EstimateBlueprintConfig } from '../../../../../../prisma/estimate-blueprint-config.types';
import { itNetworksBlueprint } from '../../../../../../prisma/estimate-blueprints/categories/it-networks.blueprint';

describe('IT networks measurements (it-networks)', () => {
  it('computes network cable and boolean feature counts', () => {
    const result = deriveItNetworksMeasurements(
      null,
      {
        networkPoints: 12,
        pagesCount: 10,
        hasBackend: true,
        hasCMS: true,
        hasEcommerce: false,
        documentationRequired: true,
        slaRequired: true,
        projectScope: 'Mediu (6-20 pagini / 1-2 săptămâni)',
      },
      {},
    );

    expect(result.networkCableM).toBe(240);
    expect(result.hasBackendCount).toBe(1);
    expect(result.hasCmsCount).toBe(1);
    expect(result.hasEcommerceCount).toBe(0);
    expect(result.analysisHours).toBe(16);
    expect(result.testingHours).toBe(8);
    expect(result.trainingHours).toBe(6);
    expect(result.slaUnits).toBe(1);
  });

  it('enables plan wizard only for network direction', () => {
    expect(shouldEnablePlanWizardForItNetworks('network')).toBe(true);
    expect(shouldEnablePlanWizardForItNetworks('Rețelistică & Cablare')).toBe(true);
    expect(shouldEnablePlanWizardForItNetworks('web')).toBe(false);
  });

  it('flags enterprise projects for manual review', () => {
    const result = deriveItNetworksMeasurements(
      null,
      { projectScope: 'Enterprise (20+ pagini / 1+ lună)' },
      {},
    );

    expect(shouldRequireItManualReview('Enterprise (20+ pagini / 1+ lună)')).toBe(true);
    expect(result.requiresManualReview).toBe(1);
    expect(resolveAnalysisHours('Enterprise (20+ pagini / 1+ lună)')).toBe(32);
  });

  it('keeps web and network lines separated by work modules', () => {
    const engine = new EstimatePricingEngine();
    const measurements = deriveItNetworksMeasurements(
      null,
      {
        pagesCount: 5,
        networkPoints: 8,
        hasBackend: true,
        projectScope: 'Mic (1-5 pagini / 1-2 zile)',
      },
      {},
    );

    const webLines = engine.buildLinesFromRules(itNetworksBlueprint.pricingRules, measurements, {
      enabledWorkModules: ['frontend', 'backend'],
      config: itNetworksBlueprint as EstimateBlueprintConfig,
    });
    const networkLines = engine.buildLinesFromRules(itNetworksBlueprint.pricingRules, measurements, {
      enabledWorkModules: ['network_cabling'],
      config: itNetworksBlueprint as EstimateBlueprintConfig,
    });

    expect(webLines.some((line) => line.description.toLowerCase().includes('frontend'))).toBe(true);
    expect(webLines.some((line) => line.description.toLowerCase().includes('cablare'))).toBe(false);
    expect(networkLines.some((line) => line.description.toLowerCase().includes('cablare'))).toBe(true);
  });
});
