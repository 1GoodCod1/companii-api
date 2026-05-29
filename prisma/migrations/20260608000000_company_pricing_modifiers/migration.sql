-- Per-company overrides of pricing-modifier percentages (premium/complexity/etc).
-- Sparse JSON map keyed by registry key, e.g. { "finishing.finishLevel.premium": 20 }.
-- Null/absent => registry default. Additive, no backfill.
ALTER TABLE "companies" ADD COLUMN "pricing_modifiers" JSONB;
