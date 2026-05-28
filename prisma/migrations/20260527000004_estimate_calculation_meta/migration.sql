-- E-05 / E-07: calculation trace and manual review flag on estimate projects
ALTER TABLE "estimate_projects" ADD COLUMN "requires_manual_review" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "estimate_projects" ADD COLUMN "calculation_trace" JSONB;
