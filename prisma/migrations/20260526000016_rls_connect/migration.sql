-- Align RLS policies with application roles and extend tenant coverage.

CREATE OR REPLACE FUNCTION app_current_company_role() RETURNS text AS $$
  SELECT NULLIF(current_setting('app.current_company_role', true), '')
$$ LANGUAGE sql STABLE;

-- companies
DROP POLICY IF EXISTS companies_select ON companies;
CREATE POLICY companies_select ON companies FOR SELECT USING (
  (is_published = true AND is_verified = true)
  OR id::text = app_current_company_id()
  OR owner_user_id::text = app_current_user_id()
  OR EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = companies.id
      AND cm.user_id::text = app_current_user_id()
      AND cm.status = 'ACTIVE'
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
);

DROP POLICY IF EXISTS companies_write ON companies;
CREATE POLICY companies_write ON companies FOR ALL USING (
  app_user_role() = 'PLATFORM_ADMIN'
  OR (
    id::text = app_current_company_id()
    AND (
      owner_user_id::text = app_current_user_id()
      OR app_current_company_role() IN ('OWNER', 'MANAGER')
    )
  )
) WITH CHECK (
  app_user_role() = 'PLATFORM_ADMIN'
  OR (
    id::text = app_current_company_id()
    AND (
      owner_user_id::text = app_current_user_id()
      OR app_current_company_role() IN ('OWNER', 'MANAGER')
    )
  )
);

-- company_members
DROP POLICY IF EXISTS company_members_policy ON company_members;
CREATE POLICY company_members_policy ON company_members FOR ALL USING (
  company_id::text = app_current_company_id()
  OR user_id::text = app_current_user_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  company_id::text = app_current_company_id()
  OR user_id::text = app_current_user_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
);

-- company_customers (unchanged semantics, explicit WITH CHECK)
DROP POLICY IF EXISTS company_customers_policy ON company_customers;
CREATE POLICY company_customers_policy ON company_customers FOR ALL USING (
  company_id::text = app_current_company_id()
  OR portal_user_id::text = app_current_user_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  company_id::text = app_current_company_id()
  OR portal_user_id::text = app_current_user_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
);

-- interventions
DROP POLICY IF EXISTS interventions_policy ON interventions;
CREATE POLICY interventions_policy ON interventions FOR ALL USING (
  company_id::text = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  company_id::text = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
);

-- Additional tenant tables
ALTER TABLE company_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY company_invitations_policy ON company_invitations FOR ALL USING (
  company_id::text = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  company_id::text = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
);

ALTER TABLE company_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY company_subscriptions_policy ON company_subscriptions FOR ALL USING (
  company_id::text = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  company_id::text = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
);

ALTER TABLE service_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_packages FORCE ROW LEVEL SECURITY;
CREATE POLICY service_packages_policy ON service_packages FOR ALL USING (
  company_id::text = app_current_company_id()
  OR (
    is_published = true
    AND EXISTS (
      SELECT 1 FROM companies c
      WHERE c.id = service_packages.company_id
        AND c.is_published = true
        AND c.is_verified = true
    )
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  company_id::text = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
);

ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes FORCE ROW LEVEL SECURITY;
CREATE POLICY quotes_policy ON quotes FOR ALL USING (
  company_id::text = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  company_id::text = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
);

ALTER TABLE company_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_invoices FORCE ROW LEVEL SECURITY;
CREATE POLICY company_invoices_policy ON company_invoices FOR ALL USING (
  company_id::text = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  company_id::text = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
);

ALTER TABLE company_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_services FORCE ROW LEVEL SECURITY;
CREATE POLICY company_services_policy ON company_services FOR ALL USING (
  company_id::text = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  company_id::text = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;
CREATE POLICY payments_policy ON payments FOR ALL USING (
  company_id IS NULL
  OR company_id::text = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  company_id IS NULL
  OR company_id::text = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
);

ALTER TABLE company_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY company_reviews_policy ON company_reviews FOR ALL USING (
  company_id::text = app_current_company_id()
  OR author_user_id::text = app_current_user_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  company_id::text = app_current_company_id()
  OR author_user_id::text = app_current_user_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
);

ALTER TABLE intervention_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE intervention_notes FORCE ROW LEVEL SECURITY;
CREATE POLICY intervention_notes_policy ON intervention_notes FOR ALL USING (
  EXISTS (
    SELECT 1 FROM interventions i
    WHERE i.id = intervention_notes.intervention_id
      AND i.company_id::text = app_current_company_id()
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM interventions i
    WHERE i.id = intervention_notes.intervention_id
      AND i.company_id::text = app_current_company_id()
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
);

ALTER TABLE intervention_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE intervention_status_history FORCE ROW LEVEL SECURITY;
CREATE POLICY intervention_status_history_policy ON intervention_status_history FOR ALL USING (
  EXISTS (
    SELECT 1 FROM interventions i
    WHERE i.id = intervention_status_history.intervention_id
      AND i.company_id::text = app_current_company_id()
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM interventions i
    WHERE i.id = intervention_status_history.intervention_id
      AND i.company_id::text = app_current_company_id()
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
);

ALTER TABLE quote_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY quote_lines_policy ON quote_lines FOR ALL USING (
  EXISTS (
    SELECT 1 FROM quotes q
    WHERE q.id = quote_lines.quote_id
      AND q.company_id::text = app_current_company_id()
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM quotes q
    WHERE q.id = quote_lines.quote_id
      AND q.company_id::text = app_current_company_id()
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
);
