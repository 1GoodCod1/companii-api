-- CreateTable
CREATE TABLE "crews" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crew_members" (
    "crew_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "role" TEXT,
    "is_lead" BOOLEAN NOT NULL DEFAULT false,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crew_members_pkey" PRIMARY KEY ("crew_id","member_id")
);

-- CreateTable
CREATE TABLE "intervention_assignments" (
    "id" TEXT NOT NULL,
    "intervention_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "is_lead" BOOLEAN NOT NULL DEFAULT false,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intervention_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crews_company_id_name_key" ON "crews"("company_id", "name");

-- CreateIndex
CREATE INDEX "crews_company_id_is_active_idx" ON "crews"("company_id", "is_active");

-- CreateIndex
CREATE INDEX "crew_members_member_id_idx" ON "crew_members"("member_id");

-- CreateIndex
CREATE UNIQUE INDEX "intervention_assignments_intervention_id_member_id_key" ON "intervention_assignments"("intervention_id", "member_id");

-- CreateIndex
CREATE INDEX "intervention_assignments_member_id_assigned_at_idx" ON "intervention_assignments"("member_id", "assigned_at");

-- AddForeignKey
ALTER TABLE "crews" ADD CONSTRAINT "crews_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_members" ADD CONSTRAINT "crew_members_crew_id_fkey" FOREIGN KEY ("crew_id") REFERENCES "crews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_members" ADD CONSTRAINT "crew_members_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "company_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intervention_assignments" ADD CONSTRAINT "intervention_assignments_intervention_id_fkey" FOREIGN KEY ("intervention_id") REFERENCES "interventions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intervention_assignments" ADD CONSTRAINT "intervention_assignments_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "company_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_crew_id_fkey" FOREIGN KEY ("crew_id") REFERENCES "crews"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: mirror the existing single technician into the new assignments table so existing interventions get a row (technician = lead).
INSERT INTO "intervention_assignments" ("id", "intervention_id", "member_id", "is_lead", "assigned_at")
SELECT
  gen_random_uuid()::text,
  i.id,
  i.technician_id,
  true,
  i.created_at
FROM "interventions" i
WHERE i.technician_id IS NOT NULL
ON CONFLICT DO NOTHING;
