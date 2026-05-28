-- CreateIndex
CREATE INDEX "company_invoices_company_id_payment_status_idx" ON "company_invoices"("company_id", "payment_status");

-- CreateIndex
CREATE INDEX "company_invoices_company_id_issued_at_idx" ON "company_invoices"("company_id", "issued_at");

-- CreateIndex
CREATE INDEX "intervention_notes_intervention_id_created_at_idx" ON "intervention_notes"("intervention_id", "created_at");

-- CreateIndex
CREATE INDEX "intervention_photos_intervention_id_sort_order_idx" ON "intervention_photos"("intervention_id", "sort_order");

-- CreateIndex
CREATE INDEX "intervention_status_history_intervention_id_changed_at_idx" ON "intervention_status_history"("intervention_id", "changed_at");

-- CreateIndex
CREATE INDEX "interventions_technician_id_status_idx" ON "interventions"("technician_id", "status");

-- CreateIndex
CREATE INDEX "quotes_company_id_status_created_at_idx" ON "quotes"("company_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "quotes_customer_id_idx" ON "quotes"("customer_id");
