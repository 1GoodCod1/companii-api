import type { Plan2dData } from '../../pricing/plan2d.types';

export class SitePlan {
  readonly plan2d: Plan2dData | null;
  readonly plan3d: unknown | null;

  constructor(plan2d: Plan2dData | null, plan3d: unknown | null) {
    this.plan2d = plan2d;
    this.plan3d = plan3d;
  }

  static fromRaw(raw: unknown): SitePlan {
    if (!raw || typeof raw !== 'object') return new SitePlan(null, null);
    const candidate = raw as Record<string, unknown>;
    const plan2d = candidate.plan2d as Plan2dData | null;
    const plan3d = candidate.plan3d ?? null;
    return new SitePlan(
      Array.isArray(plan2d?.rooms) ? plan2d : null,
      plan3d,
    );
  }
}