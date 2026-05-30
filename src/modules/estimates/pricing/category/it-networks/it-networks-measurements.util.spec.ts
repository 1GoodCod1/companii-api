import { EstimatePricingEngine } from '../../pricing-engine.service';
import { deriveItNetworksMeasurements } from './it-networks-measurements.util';
import type { EstimateBlueprintConfig } from '../../../../../../prisma/estimate-blueprint-config.types';
import { itNetworksBlueprint } from '../../../../../../prisma/estimate-blueprints/categories/it-networks.blueprint';

describe('IT networks measurements (it-networks)', () => {
  it('computes network cable, support units and conditional audit/test hours', () => {
    const result = deriveItNetworksMeasurements(
      null,
      {
        networkPoints: 10,
        avgCableLengthPerPort: 25,
        siteSurveyRequired: true,
        commissioningRequired: true,
        documentationRequired: true,
        slaRequired: true,
      },
      {},
    );

    expect(result.networkCableM).toBe(250);
    expect(result.networkPoints).toBe(10);
    expect(result.analysisHours).toBe(8);
    expect(result.testingHours).toBe(8);
    expect(result.trainingHours).toBe(4);
    expect(result.slaUnits).toBe(1);
    expect(result.planWizardEnabled).toBe(1);
  });

  it('keeps hours at 0 when survey and commissioning are not selected', () => {
    const result = deriveItNetworksMeasurements(
      null,
      {
        networkPoints: 10,
        siteSurveyRequired: false,
        commissioningRequired: false,
        documentationRequired: false,
      },
      {},
    );

    expect(result.analysisHours).toBe(0);
    expect(result.testingHours).toBe(0);
    expect(result.trainingHours).toBe(0);
  });

  it('correctly maps separate workstation and server configuration and assembly counts', () => {
    const engine = new EstimatePricingEngine();
    const measurements = deriveItNetworksMeasurements(
      null,
      {
        networkPoints: 5,
        serversToConfigure: 2,
        serversToAssemble: 1,
        workstationsToConfigure: 10,
        workstationsToAssemble: 4,
      },
      {},
    );

    expect(measurements.serversToConfigure).toBe(2);
    expect(measurements.serversToAssemble).toBe(1);
    expect(measurements.workstationsToConfigure).toBe(10);
    expect(measurements.workstationsToAssemble).toBe(4);

    const configRules = engine.buildLinesFromRules(itNetworksBlueprint.pricingRules, measurements, {
      enabledWorkModules: ['servers'],
      config: itNetworksBlueprint as EstimateBlueprintConfig,
    });
    const assemblyRules = engine.buildLinesFromRules(itNetworksBlueprint.pricingRules, measurements, {
      enabledWorkModules: ['hardware_components'],
      config: itNetworksBlueprint as EstimateBlueprintConfig,
    });

    expect(configRules.some((line) => line.description.includes('Configurare server'))).toBe(true);
    expect(configRules.some((line) => line.description.includes('Asamblare'))).toBe(false);

    expect(assemblyRules.some((line) => line.description.includes('Asamblare fizică'))).toBe(true);
    expect(assemblyRules.some((line) => line.description.includes('Configurare'))).toBe(false);
  });
});
