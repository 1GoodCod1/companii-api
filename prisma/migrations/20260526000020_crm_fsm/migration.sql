-- CRM leads pipeline + field checklist progress

CREATE TYPE "CompanyLeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST');
CREATE TYPE "CompanyLeadSource" AS ENUM ('PACKAGE_BOOKING', 'MANUAL', 'PHONE', 'WEBSITE');

CREATE TABLE "company_leads" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "booking_id" TEXT,
    "contact_name" TEXT NOT NULL,
    "contact_phone" TEXT NOT NULL,
    "contact_email" TEXT,
    "message" TEXT,
    "address" TEXT,
    "status" "CompanyLeadStatus" NOT NULL DEFAULT 'NEW',
    "source" "CompanyLeadSource" NOT NULL DEFAULT 'MANUAL',
    "category_id" TEXT,
    "package_title" TEXT,
    "scheduled_at" TIMESTAMP(3),
    "notes" TEXT,
    "converted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_leads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "company_leads_booking_id_key" ON "company_leads"("booking_id");
CREATE INDEX "company_leads_company_id_status_created_at_idx" ON "company_leads"("company_id", "status", "created_at");

ALTER TABLE "interventions" ADD COLUMN "checklist_progress" JSONB;

ALTER TABLE "company_leads" ADD CONSTRAINT "company_leads_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_leads" ADD CONSTRAINT "company_leads_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "company_customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "company_leads" ADD CONSTRAINT "company_leads_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "package_bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "company_leads" ADD CONSTRAINT "company_leads_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "interventions" ADD CONSTRAINT "interventions_source_lead_id_fkey" FOREIGN KEY ("source_lead_id") REFERENCES "company_leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE company_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_leads FORCE ROW LEVEL SECURITY;
CREATE POLICY company_leads_policy ON company_leads FOR ALL USING (
  company_id::text = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  company_id::text = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
);
