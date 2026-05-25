-- Smart estimates (Smetă inteligentă)

CREATE TYPE "EstimateProjectStatus" AS ENUM (
  'DRAFT',
  'MEASURED',
  'CALCULATED',
  'APPROVED',
  'SENT',
  'ACCEPTED',
  'IN_EXECUTION',
  'DONE',
  'CANCELLED'
);

CREATE TYPE "EstimateStageKind" AS ENUM ('LABOR', 'MATERIAL', 'MIXED');

CREATE TABLE "estimate_blueprints" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "config" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estimate_blueprints_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "estimate_blueprints_category_id_key" ON "estimate_blueprints"("category_id");

CREATE TABLE "estimate_projects" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "blueprint_id" TEXT,
    "quote_id" TEXT,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "EstimateProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "site_type" TEXT,
    "address" TEXT,
    "margin_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "labor_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "material_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "grand_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "valid_until" TIMESTAMP(3),
    "diagnostic_answers" JSONB,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estimate_projects_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "estimate_projects_number_key" ON "estimate_projects"("number");
CREATE UNIQUE INDEX "estimate_projects_quote_id_key" ON "estimate_projects"("quote_id");
CREATE INDEX "estimate_projects_company_id_status_created_at_idx" ON "estimate_projects"("company_id", "status", "created_at");
CREATE INDEX "estimate_projects_category_id_idx" ON "estimate_projects"("category_id");

CREATE TABLE "estimate_site_plans" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "plan_2d" JSONB NOT NULL,
    "plan_3d" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estimate_site_plans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "estimate_site_plans_project_id_key" ON "estimate_site_plans"("project_id");

CREATE TABLE "estimate_stages" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "EstimateStageKind" NOT NULL DEFAULT 'MIXED',
    "description" TEXT,
    "labor_hours" DECIMAL(8,2),
    "labor_rate" DECIMAL(12,2),
    "labor_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "material_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "stage_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "duration_days" INTEGER,
    "checklist" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estimate_stages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "estimate_stages_project_id_sort_order_idx" ON "estimate_stages"("project_id", "sort_order");

CREATE TABLE "estimate_lines" (
    "id" TEXT NOT NULL,
    "stage_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(10,2) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'buc',
    "unit_price" DECIMAL(12,2) NOT NULL,
    "line_total" DECIMAL(12,2) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "estimate_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "estimate_lines_stage_id_sort_order_idx" ON "estimate_lines"("stage_id", "sort_order");

CREATE TABLE "estimate_measurements" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "room_key" TEXT,
    "key" TEXT NOT NULL,
    "label" TEXT,
    "value" DECIMAL(12,2) NOT NULL,
    "unit" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "estimate_measurements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "estimate_measurements_project_id_key_idx" ON "estimate_measurements"("project_id", "key");

ALTER TABLE "interventions" ADD COLUMN "estimate_project_id" TEXT;
ALTER TABLE "interventions" ADD COLUMN "estimate_stage_id" TEXT;

ALTER TABLE "estimate_blueprints" ADD CONSTRAINT "estimate_blueprints_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "estimate_projects" ADD CONSTRAINT "estimate_projects_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "estimate_projects" ADD CONSTRAINT "estimate_projects_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "company_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "estimate_projects" ADD CONSTRAINT "estimate_projects_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "estimate_projects" ADD CONSTRAINT "estimate_projects_blueprint_id_fkey" FOREIGN KEY ("blueprint_id") REFERENCES "estimate_blueprints"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "estimate_projects" ADD CONSTRAINT "estimate_projects_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "estimate_site_plans" ADD CONSTRAINT "estimate_site_plans_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "estimate_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "estimate_stages" ADD CONSTRAINT "estimate_stages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "estimate_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "estimate_lines" ADD CONSTRAINT "estimate_lines_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "estimate_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "estimate_measurements" ADD CONSTRAINT "estimate_measurements_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "estimate_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "interventions" ADD CONSTRAINT "interventions_estimate_project_id_fkey" FOREIGN KEY ("estimate_project_id") REFERENCES "estimate_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_estimate_stage_id_fkey" FOREIGN KEY ("estimate_stage_id") REFERENCES "estimate_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS
ALTER TABLE estimate_blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_blueprints FORCE ROW LEVEL SECURITY;
CREATE POLICY estimate_blueprints_read ON estimate_blueprints FOR SELECT USING (true);

ALTER TABLE estimate_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_projects FORCE ROW LEVEL SECURITY;
CREATE POLICY estimate_projects_policy ON estimate_projects FOR ALL USING (
  company_id::text = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  company_id::text = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
);

ALTER TABLE estimate_site_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_site_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY estimate_site_plans_policy ON estimate_site_plans FOR ALL USING (
  EXISTS (
    SELECT 1 FROM estimate_projects ep
    WHERE ep.id = estimate_site_plans.project_id
      AND ep.company_id::text = app_current_company_id()
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM estimate_projects ep
    WHERE ep.id = estimate_site_plans.project_id
      AND ep.company_id::text = app_current_company_id()
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
);

ALTER TABLE estimate_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_stages FORCE ROW LEVEL SECURITY;
CREATE POLICY estimate_stages_policy ON estimate_stages FOR ALL USING (
  EXISTS (
    SELECT 1 FROM estimate_projects ep
    WHERE ep.id = estimate_stages.project_id
      AND ep.company_id::text = app_current_company_id()
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM estimate_projects ep
    WHERE ep.id = estimate_stages.project_id
      AND ep.company_id::text = app_current_company_id()
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
);

ALTER TABLE estimate_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY estimate_lines_policy ON estimate_lines FOR ALL USING (
  EXISTS (
    SELECT 1 FROM estimate_stages es
    JOIN estimate_projects ep ON ep.id = es.project_id
    WHERE es.id = estimate_lines.stage_id
      AND ep.company_id::text = app_current_company_id()
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM estimate_stages es
    JOIN estimate_projects ep ON ep.id = es.project_id
    WHERE es.id = estimate_lines.stage_id
      AND ep.company_id::text = app_current_company_id()
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
);

ALTER TABLE estimate_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_measurements FORCE ROW LEVEL SECURITY;
CREATE POLICY estimate_measurements_policy ON estimate_measurements FOR ALL USING (
  EXISTS (
    SELECT 1 FROM estimate_projects ep
    WHERE ep.id = estimate_measurements.project_id
      AND ep.company_id::text = app_current_company_id()
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM estimate_projects ep
    WHERE ep.id = estimate_measurements.project_id
      AND ep.company_id::text = app_current_company_id()
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
);
