-- FSM: interventions, quotes, invoices
CREATE TABLE "interventions" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "technician_id" TEXT,
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
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "interventions_pkey" PRIMARY KEY ("id")
);

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

CREATE TABLE "intervention_notes" (
    "id" TEXT NOT NULL,
    "intervention_id" TEXT NOT NULL,
    "author_member_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "is_internal" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "intervention_notes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "intervention_photos" (
    "id" TEXT NOT NULL,
    "intervention_id" TEXT NOT NULL,
    "file_key" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "intervention_photos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "company_services" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "default_price" DECIMAL(12,2) NOT NULL,
    "materials_cost" DECIMAL(12,2),
    "vat_rate" DECIMAL(5,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "company_services_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "intervention_id" TEXT,
    "number" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "total" DECIMAL(12,2) NOT NULL,
    "valid_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quote_lines" (
    "id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "company_service_id" TEXT,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(10,2) NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "vat_rate" DECIMAL(5,2),
    CONSTRAINT "quote_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "company_invoices" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "booking_id" TEXT,
    "intervention_id" TEXT,
    "number" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "tva_amount" DECIMAL(12,2) NOT NULL,
    "tva_rate" DECIMAL(5,2) NOT NULL,
    "payment_status" "InvoicePaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "due_date" TIMESTAMP(3),
    "pdf_file_key" TEXT,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "company_invoices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "interventions_number_key" ON "interventions"("number");
CREATE INDEX "interventions_company_id_status_idx" ON "interventions"("company_id", "status");
CREATE UNIQUE INDEX "quotes_number_key" ON "quotes"("number");
CREATE UNIQUE INDEX "company_invoices_booking_id_key" ON "company_invoices"("booking_id");
CREATE UNIQUE INDEX "company_invoices_intervention_id_key" ON "company_invoices"("intervention_id");
CREATE UNIQUE INDEX "company_invoices_number_key" ON "company_invoices"("number");

ALTER TABLE "interventions" ADD CONSTRAINT "interventions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "company_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_technician_id_fkey" FOREIGN KEY ("technician_id") REFERENCES "company_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "intervention_status_history" ADD CONSTRAINT "intervention_status_history_intervention_id_fkey" FOREIGN KEY ("intervention_id") REFERENCES "interventions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "intervention_status_history" ADD CONSTRAINT "intervention_status_history_changed_by_member_id_fkey" FOREIGN KEY ("changed_by_member_id") REFERENCES "company_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "intervention_notes" ADD CONSTRAINT "intervention_notes_intervention_id_fkey" FOREIGN KEY ("intervention_id") REFERENCES "interventions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "intervention_notes" ADD CONSTRAINT "intervention_notes_author_member_id_fkey" FOREIGN KEY ("author_member_id") REFERENCES "company_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "intervention_photos" ADD CONSTRAINT "intervention_photos_intervention_id_fkey" FOREIGN KEY ("intervention_id") REFERENCES "interventions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_services" ADD CONSTRAINT "company_services_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "company_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_intervention_id_fkey" FOREIGN KEY ("intervention_id") REFERENCES "interventions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_company_service_id_fkey" FOREIGN KEY ("company_service_id") REFERENCES "company_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "company_invoices" ADD CONSTRAINT "company_invoices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_invoices" ADD CONSTRAINT "company_invoices_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "package_bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "company_invoices" ADD CONSTRAINT "company_invoices_intervention_id_fkey" FOREIGN KEY ("intervention_id") REFERENCES "interventions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
