-- Lead pipeline: project requests, in-progress smete, customer auto-link

ALTER TYPE "CompanyLeadStatus" ADD VALUE IF NOT EXISTS 'IN_PROGRESS';
ALTER TYPE "CompanyLeadSource" ADD VALUE IF NOT EXISTS 'PROJECT_REQUEST';

ALTER TABLE "company_leads" ADD COLUMN IF NOT EXISTS "estimate_project_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "company_leads_estimate_project_id_key"
  ON "company_leads"("estimate_project_id");

ALTER TABLE "company_leads"
  ADD CONSTRAINT "company_leads_estimate_project_id_fkey"
  FOREIGN KEY ("estimate_project_id") REFERENCES "estimate_projects"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
