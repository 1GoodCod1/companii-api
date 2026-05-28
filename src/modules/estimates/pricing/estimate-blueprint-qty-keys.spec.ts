import { NotFoundException } from '@nestjs/common';
import { CATEGORY_BLUEPRINTS } from '../../../../prisma/estimate-blueprints/registry';
import { EstimatePricingEngine } from './pricing-engine.service';
import {
  buildSampleDiagnosticAnswers,
  findOrphanPricingQtyKeys,
  formatOrphanQtyKeyReport,
} from '../utils/estimate-blueprint-qty-keys.util';

describe('Estimate blueprint qtyKey consistency (C-15)', () => {
  const engine = new EstimatePricingEngine();

  for (const [slug, config] of Object.entries(CATEGORY_BLUEPRINTS)) {
    it(`has no orphan qtyKeys in "${slug}"`, () => {
      const diagnostic = buildSampleDiagnosticAnswers(config);
      const measurements = engine.deriveMeasurements(null, diagnostic, slug);
      const orphans = findOrphanPricingQtyKeys(slug, config, Object.keys(measurements));

      if (orphans.length > 0) {
        throw new Error(formatOrphanQtyKeyReport(slug, orphans));
      }

      expect(orphans).toEqual([]);
    });
  }

  it('resolves qtyKeys after deriveMeasurements with sample diagnostic for all blueprints', () => {
    const allOrphans: string[] = [];

    for (const [slug, config] of Object.entries(CATEGORY_BLUEPRINTS)) {
      const diagnostic = buildSampleDiagnosticAnswers(config);
      const measurements = engine.deriveMeasurements(null, diagnostic, slug);
      const orphans = findOrphanPricingQtyKeys(slug, config, Object.keys(measurements));
      for (const key of orphans) {
        allOrphans.push(`${slug}:${key}`);
      }
    }

    expect(allOrphans).toEqual([]);
  });
});
