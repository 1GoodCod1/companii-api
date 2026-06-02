import { InterventionStatus } from '@prisma/client';
import { shouldCloseEstimateProject } from './estimate-lifecycle.util';

describe('shouldCloseEstimateProject', () => {
  it('returns false for a project with no interventions', () => {
    expect(shouldCloseEstimateProject([])).toBe(false);
  });

  it('returns false while any intervention is still open', () => {
    expect(
      shouldCloseEstimateProject([InterventionStatus.PAID, InterventionStatus.IN_PROGRESS]),
    ).toBe(false);
    expect(
      shouldCloseEstimateProject([InterventionStatus.PAID, InterventionStatus.INVOICED]),
    ).toBe(false);
    expect(shouldCloseEstimateProject([InterventionStatus.COMPLETED])).toBe(false);
  });

  it('returns true when all interventions are paid', () => {
    expect(
      shouldCloseEstimateProject([InterventionStatus.PAID, InterventionStatus.PAID]),
    ).toBe(true);
  });

  it('returns true when interventions are a mix of paid and cancelled (≥1 paid)', () => {
    expect(
      shouldCloseEstimateProject([InterventionStatus.PAID, InterventionStatus.CANCELLED]),
    ).toBe(true);
  });

  it('returns false when every intervention was cancelled (nothing delivered)', () => {
    expect(
      shouldCloseEstimateProject([InterventionStatus.CANCELLED, InterventionStatus.CANCELLED]),
    ).toBe(false);
  });
});
