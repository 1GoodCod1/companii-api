import { CATEGORY_BLUEPRINTS, categoryHasEstimateBlueprint } from '../../../../prisma/estimate-blueprints';
import {
  ESTIMATE_BLUEPRINT_CATEGORY_SLUGS,
  ESTIMATE_EXCLUDED_CATEGORY_SLUGS,
  EXPECTED_ESTIMATE_BLUEPRINT_COUNT,
  isEstimateExcludedCategorySlug,
} from '../../../common/constants/estimate-category-slugs.constants';

describe('Estimate blueprint registry (C-14)', () => {
  it('registers exactly 14 category blueprints', () => {
    expect(Object.keys(CATEGORY_BLUEPRINTS)).toHaveLength(EXPECTED_ESTIMATE_BLUEPRINT_COUNT);
    expect(Object.keys(CATEGORY_BLUEPRINTS)).toHaveLength(14);
  });

  it('matches the canonical slug list', () => {
    const registrySlugs = Object.keys(CATEGORY_BLUEPRINTS).sort();
    const expectedSlugs = [...ESTIMATE_BLUEPRINT_CATEGORY_SLUGS].sort();
    expect(registrySlugs).toEqual(expectedSlugs);
  });

  it('does not register blueprints for excluded categories', () => {
    for (const slug of ESTIMATE_EXCLUDED_CATEGORY_SLUGS) {
      expect(categoryHasEstimateBlueprint(slug)).toBe(false);
      expect(isEstimateExcludedCategorySlug(slug)).toBe(true);
    }
  });

  it('registers blueprints only for active estimate categories', () => {
    for (const slug of ESTIMATE_BLUEPRINT_CATEGORY_SLUGS) {
      expect(categoryHasEstimateBlueprint(slug)).toBe(true);
    }
  });

  it('lists six excluded categories without overlap with blueprint slugs', () => {
    expect(ESTIMATE_EXCLUDED_CATEGORY_SLUGS).toHaveLength(6);
    for (const excluded of ESTIMATE_EXCLUDED_CATEGORY_SLUGS) {
      expect(ESTIMATE_BLUEPRINT_CATEGORY_SLUGS as readonly string[]).not.toContain(excluded);
    }
  });
});
