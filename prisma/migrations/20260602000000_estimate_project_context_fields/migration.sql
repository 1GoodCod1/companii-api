-- Phase 1 / Slice 1: project-level professional fields.
-- riskReservePct влияет на grandTotal; остальные пока хранятся как контекст
-- проекта и попадут в коэффициенты pricing-engine в следующих slices.

ALTER TABLE "estimate_projects"
  ADD COLUMN "building_year" INTEGER,
  ADD COLUMN "site_floor" INTEGER,
  ADD COLUMN "access_difficulty" TEXT,
  ADD COLUMN "urgency" TEXT,
  ADD COLUMN "risk_reserve_pct" DECIMAL(5, 2) NOT NULL DEFAULT 0;
