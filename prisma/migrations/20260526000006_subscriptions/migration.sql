-- Subscriptions: company plans & billing state
CREATE TABLE "company_plans" (
    "id" TEXT NOT NULL,
    "code" "CompanySubscriptionPlan" NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MDL',
    "max_technicians" INTEGER,
    "max_interventions_per_month" INTEGER,
    "features" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "company_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "company_subscriptions" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "status" "CompanySubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "current_period_end" TIMESTAMP(3) NOT NULL,
    "activated_by_admin_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "company_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "company_plans_code_key" ON "company_plans"("code");
CREATE UNIQUE INDEX "company_subscriptions_company_id_key" ON "company_subscriptions"("company_id");

ALTER TABLE "company_subscriptions" ADD CONSTRAINT "company_subscriptions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_subscriptions" ADD CONSTRAINT "company_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "company_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
