-- CreateTable
CREATE TABLE "interventions" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "technician_id" TEXT,
    "crew_id" TEXT,
    "number" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "status" "InterventionStatus" NOT NULL DEFAULT 'NEW',
    "scheduled_at" TIMESTAMP(3),
    "estimated_price" DECIMAL(12,2),
    "final_price" DECIMAL(12,2),
    "internal_notes" TEXT,
    "source_lead_id" TEXT,
    "estimate_project_id" TEXT,
    "estimate_stage_id" TEXT,
    "checklist_progress" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interventions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intervention_status_history" (
    "id" TEXT NOT NULL,
    "intervention_id" TEXT NOT NULL,
    "from_status" "InterventionStatus",
    "to_status" "InterventionStatus" NOT NULL,
    "changed_by_member_id" TEXT NOT NULL,
    "note" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intervention_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intervention_notes" (
    "id" TEXT NOT NULL,
    "intervention_id" TEXT NOT NULL,
    "author_member_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "is_internal" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intervention_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intervention_photos" (
    "id" TEXT NOT NULL,
    "intervention_id" TEXT NOT NULL,
    "file_key" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "intervention_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "interventions_number_key" ON "interventions"("number");

-- CreateIndex
CREATE INDEX "interventions_company_id_status_idx" ON "interventions"("company_id", "status");

-- CreateIndex
CREATE INDEX "interventions_technician_id_status_idx" ON "interventions"("technician_id", "status");

-- CreateIndex
CREATE INDEX "interventions_crew_id_idx" ON "interventions"("crew_id");

-- CreateIndex
CREATE INDEX "intervention_status_history_intervention_id_changed_at_idx" ON "intervention_status_history"("intervention_id", "changed_at");

-- CreateIndex
CREATE INDEX "intervention_notes_intervention_id_created_at_idx" ON "intervention_notes"("intervention_id", "created_at");

-- CreateIndex
CREATE INDEX "intervention_photos_intervention_id_sort_order_idx" ON "intervention_photos"("intervention_id", "sort_order");

-- AddForeignKey
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "company_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_technician_id_fkey" FOREIGN KEY ("technician_id") REFERENCES "company_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_source_lead_id_fkey" FOREIGN KEY ("source_lead_id") REFERENCES "company_leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intervention_status_history" ADD CONSTRAINT "intervention_status_history_intervention_id_fkey" FOREIGN KEY ("intervention_id") REFERENCES "interventions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intervention_status_history" ADD CONSTRAINT "intervention_status_history_changed_by_member_id_fkey" FOREIGN KEY ("changed_by_member_id") REFERENCES "company_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intervention_notes" ADD CONSTRAINT "intervention_notes_intervention_id_fkey" FOREIGN KEY ("intervention_id") REFERENCES "interventions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intervention_notes" ADD CONSTRAINT "intervention_notes_author_member_id_fkey" FOREIGN KEY ("author_member_id") REFERENCES "company_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intervention_photos" ADD CONSTRAINT "intervention_photos_intervention_id_fkey" FOREIGN KEY ("intervention_id") REFERENCES "interventions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
