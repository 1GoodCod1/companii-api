import type { EstimateBlueprintConfig } from '../../../../../prisma/estimate-blueprint-config.types';
import {
  normalizeUrgency,
  resolveUrgencyLaborMultiplier,
  resolveUrgencyMaterialMultiplier,
} from './urgency.util';

describe('urgency util (Slice 3)', () => {
  describe('normalizeUrgency', () => {
    it('maps known values', () => {
      expect(normalizeUrgency('urgent')).toBe('urgent');
      expect(normalizeUrgency('emergency')).toBe('emergency');
      expect(normalizeUrgency('Urgent')).toBe('urgent');
      expect(normalizeUrgency('Normal')).toBe('normal');
    });

    it('treats null/empty/unknown as normal', () => {
      expect(normalizeUrgency(null)).toBe('normal');
      expect(normalizeUrgency(undefined)).toBe('normal');
      expect(normalizeUrgency('')).toBe('normal');
      expect(normalizeUrgency('asap')).toBe('normal');
    });
  });

  describe('resolveUrgencyLaborMultiplier', () => {
    const cfg = (impact?: EstimateBlueprintConfig['urgencyImpact']) =>
      ({ urgencyImpact: impact } as unknown as EstimateBlueprintConfig);

    it('returns 1.0 for normal regardless of config', () => {
      expect(
        resolveUrgencyLaborMultiplier(cfg({ urgent: 1.25, emergency: 1.8 }), 'normal'),
      ).toBe(1.0);
    });

    it('returns 1.0 when blueprint has no urgencyImpact', () => {
      expect(resolveUrgencyLaborMultiplier(cfg(undefined), 'emergency')).toBe(1.0);
    });

    it('returns declared coefficient', () => {
      const c = cfg({ urgent: 1.25, emergency: 1.8 });
      expect(resolveUrgencyLaborMultiplier(c, 'urgent')).toBe(1.25);
      expect(resolveUrgencyLaborMultiplier(c, 'emergency')).toBe(1.8);
    });
  });

  describe('resolveUrgencyMaterialMultiplier', () => {
    const cfg = (impact?: EstimateBlueprintConfig['urgencyImpact']) =>
      ({ urgencyImpact: impact } as unknown as EstimateBlueprintConfig);

    it('returns 1.0 unless appliesToMaterial true', () => {
      expect(
        resolveUrgencyMaterialMultiplier(
          cfg({ urgent: 1.2, emergency: 1.5 }),
          'emergency',
        ),
      ).toBe(1.0);
    });

    it('mirrors labor when opted in', () => {
      const c = cfg({ urgent: 1.2, emergency: 1.5, appliesToMaterial: true });
      expect(resolveUrgencyMaterialMultiplier(c, 'emergency')).toBe(1.5);
    });
  });
});
