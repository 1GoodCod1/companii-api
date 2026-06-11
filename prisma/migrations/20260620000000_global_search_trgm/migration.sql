-- Global cabinet search: trigram indexes so ILIKE '%term%' stays fast as tenants grow

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- customers
CREATE INDEX IF NOT EXISTS idx_customers_full_name_trgm ON company_customers USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_phone_trgm ON company_customers USING gin (phone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_email_trgm ON company_customers USING gin (email gin_trgm_ops);

-- leads
CREATE INDEX IF NOT EXISTS idx_leads_contact_name_trgm ON company_leads USING gin (contact_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_leads_contact_phone_trgm ON company_leads USING gin (contact_phone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_leads_service_title_trgm ON company_leads USING gin (service_title gin_trgm_ops);

-- interventions
CREATE INDEX IF NOT EXISTS idx_interventions_number_trgm ON interventions USING gin (number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_interventions_type_trgm ON interventions USING gin (type gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_interventions_address_trgm ON interventions USING gin (address gin_trgm_ops);

-- quotes / invoices
CREATE INDEX IF NOT EXISTS idx_quotes_number_trgm ON quotes USING gin (number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_invoices_number_trgm ON company_invoices USING gin (number gin_trgm_ops);

-- estimates
CREATE INDEX IF NOT EXISTS idx_estimate_projects_number_trgm ON estimate_projects USING gin (number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_estimate_projects_title_trgm ON estimate_projects USING gin (title gin_trgm_ops);

-- services
CREATE INDEX IF NOT EXISTS idx_company_services_name_trgm ON company_services USING gin (name gin_trgm_ops);
