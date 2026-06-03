-- Multi-company portal: a portal user may be a customer of many companies.
-- Replace the global-unique link (portal_user_id) with a per-company unique
-- so the same user can link to one customer record PER company.
DROP INDEX "company_customers_portal_user_id_key";

CREATE UNIQUE INDEX "company_customers_company_id_portal_user_id_key"
  ON "company_customers"("company_id", "portal_user_id");
