import type { EstimateBlueprintConfig } from '../../../../../prisma/estimate-blueprint-config.types';
import {
  normalizeAccessDifficulty,
  resolveAccessDifficultyLaborMultiplier,
  resolveAccessDifficultyLevel,
  resolveAccessDifficultyMaterialMultiplier,
} from './access-difficulty.util';

describe('access-difficulty util (Slice 2)', () => {
  describe('normalizeAccessDifficulty', () => {
    it('normalizes RO/EN/legacy strings', () => {
      expect(normalizeAccessDifficulty('dificil')).toBe('difficult');
      expect(normalizeAccessDifficulty('Dificil')).toBe('difficult');
      expect(normalizeAccessDifficulty('hard')).toBe('difficult');
      expect(normalizeAccessDifficulty('mediu')).toBe('medium');
      expect(normalizeAccessDifficulty('medium')).toBe('medium');
      expect(normalizeAccessDifficulty('ușor')).toBe('easy');
      expect(normalizeAccessDifficulty('easy')).toBe('easy');
    });

    it('treats null/undefined/empty as easy', () => {
      expect(normalizeAccessDifficulty(null)).toBe('easy');
      expect(normalizeAccessDifficulty(undefined)).toBe('easy');
      expect(normalizeAccessDifficulty('')).toBe('easy');
    });
  });

  describe('resolveAccessDifficultyLevel (project > diagnostic fallback)', () => {
    it('prefers project-level value when set', () => {
      expect(resolveAccessDifficultyLevel('difficult', { accessDifficulty: 'easy' })).toBe(
        'difficult',
      );
    });

    it('falls back to diagnostic for legacy santehnika projects', () => {
      expect(resolveAccessDifficultyLevel(null, { accessDifficulty: 'dificil' })).toBe(
        'difficult',
      );
      expect(resolveAccessDifficultyLevel(undefined, { accessDifficulty: 'mediu' })).toBe(
        'medium',
      );
    });

    it('defaults to easy when nothing is set', () => {
      expect(resolveAccessDifficultyLevel(null, null)).toBe('easy');
      expect(resolveAccessDifficultyLevel(null, {})).toBe('easy');
    });
  });

  describe('resolveAccessDifficultyLaborMultiplier', () => {
    const cfg = (impact?: EstimateBlueprintConfig['accessDifficultyImpact']) =>
      ({ accessDifficultyImpact: impact } as unknown as EstimateBlueprintConfig);

    it('returns 1.0 when blueprint has no impact (cleaning/it-networks)', () => {
      expect(resolveAccessDifficultyLaborMultiplier(cfg(undefined), 'difficult')).toBe(1.0);
    });

    it('returns the declared coefficient for the level', () => {
      const c = cfg({ easy: 1.0, medium: 1.2, difficult: 1.4 });
      expect(resolveAccessDifficultyLaborMultiplier(c, 'easy')).toBe(1.0);
      expect(resolveAccessDifficultyLaborMultiplier(c, 'medium')).toBe(1.2);
      expect(resolveAccessDifficultyLaborMultiplier(c, 'difficult')).toBe(1.4);
    });
  });

  describe('resolveAccessDifficultyMaterialMultiplier', () => {
    const cfg = (impact?: EstimateBlueprintConfig['accessDifficultyImpact']) =>
      ({ accessDifficultyImpact: impact } as unknown as EstimateBlueprintConfig);

    it('returns 1.0 unless appliesToMaterial is true', () => {
      expect(
        resolveAccessDifficultyMaterialMultiplier(
          cfg({ easy: 1.0, medium: 1.2, difficult: 1.4 }),
          'difficult',
        ),
      ).toBe(1.0);
    });

    it('applies the same multiplier as labor when opted in (mobila/okna-dveri)', () => {
      const c = cfg({ easy: 1.0, medium: 1.2, difficult: 1.4, appliesToMaterial: true });
      expect(resolveAccessDifficultyMaterialMultiplier(c, 'difficult')).toBe(1.4);
    });
  });
});
