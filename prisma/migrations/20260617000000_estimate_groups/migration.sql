-- CreateTable
CREATE TABLE "estimate_groups" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "title" TEXT,
    "address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estimate_groups_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "estimate_projects" ADD COLUMN "group_id" TEXT;

-- CreateIndex
CREATE INDEX "estimate_groups_company_id_customer_id_idx" ON "estimate_groups"("company_id", "customer_id");

-- CreateIndex
CREATE INDEX "estimate_projects_group_id_idx" ON "estimate_projects"("group_id");

-- AddForeignKey
ALTER TABLE "estimate_groups" ADD CONSTRAINT "estimate_groups_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_groups" ADD CONSTRAINT "estimate_groups_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "company_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_projects" ADD CONSTRAINT "estimate_projects_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "estimate_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS
ALTER TABLE estimate_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_groups FORCE ROW LEVEL SECURITY;

CREATE POLICY estimate_groups_policy ON estimate_groups FOR ALL USING (
  company_id::text = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  company_id::text = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
);
