import { runSanityChecks } from './sanity-checks.util';

describe('runSanityChecks (Slice 4)', () => {
  it('returns no warnings when measurements look fine', () => {
    const warnings = runSanityChecks(
      'elektrika',
      { roomCount: 3, cableLengthM: 50, electricPoints: 9 },
      {},
    );
    expect(warnings).toEqual([]);
  });

  it('flags short cable for room count (elektrika)', () => {
    const warnings = runSanityChecks(
      'elektrika',
      { roomCount: 5, cableLengthM: 10, electricPoints: 5 },
      {},
    );
    const cableWarn = warnings.find((w) => w.key === 'cableLengthLowForRoomCount');
    expect(cableWarn).toBeDefined();
    expect(cableWarn?.severity).toBe('warning');
    expect(cableWarn?.message).toContain('10m');
    expect(cableWarn?.message).toContain('5 camere');
  });

  it('warns about missing system power (panouri-solare)', () => {
    const warnings = runSanityChecks(
      'panouri-solare',
      { panelCount: 10, systemPowerKw: 0 },
      {},
    );
    expect(warnings.some((w) => w.key === 'missingSystemPower')).toBe(true);
  });

  it('skips missingSystemPower warning when panelWp is set in diagnostic', () => {
    const warnings = runSanityChecks(
      'panouri-solare',
      { panelCount: 10, systemPowerKw: 0 },
      { panelWp: 400 },
    );
    expect(warnings.some((w) => w.key === 'missingSystemPower')).toBe(false);
  });

  it('flags too many panels per inverter (info severity)', () => {
    const warnings = runSanityChecks(
      'panouri-solare',
      { panelCount: 25, systemPowerKw: 10, inverterCount: 1 },
      {},
    );
    const w = warnings.find((x) => x.key === 'inverterMismatch');
    expect(w?.severity).toBe('info');
  });

  it('warns about empty fenestration (okna-dveri)', () => {
    const warnings = runSanityChecks('okna-dveri', { windowCount: 0, doorCount: 0 }, {});
    expect(warnings.some((w) => w.key === 'noFenestration')).toBe(true);
  });

  it('warns about empty furniture (mobila)', () => {
    const warnings = runSanityChecks(
      'mobila',
      { cabinetCount: 0, wardrobeCount: 0, linearMeters: 0 },
      {},
    );
    expect(warnings.some((w) => w.key === 'noFurniture')).toBe(true);
  });

  it('flags short pipe length for many bathrooms (santehnika)', () => {
    const warnings = runSanityChecks(
      'santehnika',
      { bathroomCount: 4, pipeLengthM: 8, plumbingPoints: 8 },
      {},
    );
    expect(warnings.some((w) => w.key === 'pipeShortForBathrooms')).toBe(true);
  });

  it('flags short route for clima', () => {
    const warnings = runSanityChecks('clima', { acUnits: 4, routeLengthM: 5 }, {});
    expect(warnings.some((w) => w.key === 'routeShortForUnits')).toBe(true);
  });

  it('flags short borders for pavaj', () => {
    // pavementArea 100 → estimated min perimeter sqrt(100)*3 = 30. We pass 10.
    const warnings = runSanityChecks(
      'pavaj',
      { pavementArea: 100, borderLengthM: 10 },
      {},
    );
    expect(warnings.some((w) => w.key === 'bordersTooShort')).toBe(true);
  });

  it('emits universal requiresManualReview warning', () => {
    const warnings = runSanityChecks(
      'panouri-solare',
      { panelCount: 50, systemPowerKw: 20, requiresManualReview: 1 },
      {},
    );
    expect(warnings.some((w) => w.key === 'requiresManualReview')).toBe(true);
  });

  it('returns empty for unknown category (universal-only checks)', () => {
    const warnings = runSanityChecks('unknown-slug', { roomCount: 5 }, {});
    expect(warnings).toEqual([]);
  });
});
