import {
  canBeAddedAsRelatedEstimate,
  canHostEstimateRelatedProjects,
  canLinkEstimateCategories,
} from './estimate-category-slugs.constants';

describe('estimate related group categories', () => {
  it('only finishing can host related estimates', () => {
    expect(canHostEstimateRelatedProjects('lucrari-finisaj')).toBe(true);
    expect(canHostEstimateRelatedProjects('elektrika')).toBe(false);
    expect(canHostEstimateRelatedProjects('santehnika')).toBe(false);
    expect(canHostEstimateRelatedProjects('clima')).toBe(false);
    expect(canHostEstimateRelatedProjects('pavaj')).toBe(false);
    expect(canHostEstimateRelatedProjects('it-hardware')).toBe(false);
  });

  it('allows elektrika, santehnika and constructii as related targets', () => {
    expect(canBeAddedAsRelatedEstimate('elektrika')).toBe(true);
    expect(canBeAddedAsRelatedEstimate('santehnika')).toBe(true);
    expect(canBeAddedAsRelatedEstimate('constructii')).toBe(true);
    expect(canBeAddedAsRelatedEstimate('clima')).toBe(false);
    expect(canBeAddedAsRelatedEstimate('pavaj')).toBe(false);
    expect(canBeAddedAsRelatedEstimate('lucrari-finisaj')).toBe(false);
  });

  it('links only from finishing to allowed targets', () => {
    expect(canLinkEstimateCategories('lucrari-finisaj', 'elektrika')).toBe(true);
    expect(canLinkEstimateCategories('lucrari-finisaj', 'santehnika')).toBe(true);
    expect(canLinkEstimateCategories('lucrari-finisaj', 'constructii')).toBe(true);
    expect(canLinkEstimateCategories('elektrika', 'santehnika')).toBe(false);
    expect(canLinkEstimateCategories('lucrari-finisaj', 'clima')).toBe(false);
    expect(canLinkEstimateCategories('lucrari-finisaj', 'it-hardware')).toBe(false);
  });
});
