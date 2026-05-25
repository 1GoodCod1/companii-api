-- Row-level security (multi-tenant Faber Companii)

CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS text AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_current_company_id() RETURNS text AS $$
  SELECT NULLIF(current_setting('app.current_company_id', true), '')
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_user_role() RETURNS text AS $$
  SELECT NULLIF(current_setting('app.user_role', true), '')
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_current_member_id() RETURNS text AS $$
  SELECT NULLIF(current_setting('app.current_member_id', true), '')
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_current_customer_id() RETURNS text AS $$
  SELECT NULLIF(current_setting('app.current_customer_id', true), '')
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_current_company_role() RETURNS text AS $$
  SELECT NULLIF(current_setting('app.current_company_role', true), '')
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_can_access_intervention(p_company_id text, p_technician_id text) RETURNS boolean AS $$
  SELECT
    app_user_role() = 'PLATFORM_ADMIN'
    OR (
      p_company_id = app_current_company_id()
      AND (
        app_current_company_role() IN ('OWNER', 'MANAGER')
        OR (
          app_current_company_role() = 'MEMBER'
          AND p_technician_id IS NOT NULL
          AND p_technician_id = app_current_member_id()
        )
      )
    );
$$ LANGUAGE sql STABLE;

-- companies
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies FORCE ROW LEVEL SECURITY;

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
ALTER TABLE company_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_members FORCE ROW LEVEL SECURITY;

CREATE POLICY company_members_policy ON company_members FOR ALL USING (
  company_id::text = app_current_company_id()
  OR user_id::text = app_current_user_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  company_id::text = app_current_company_id()
  OR user_id::text = app_current_user_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
);

-- company_customers
ALTER TABLE company_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_customers FORCE ROW LEVEL SECURITY;

CREATE POLICY company_customers_policy ON company_customers FOR ALL USING (
  company_id::text = app_current_company_id()
  OR portal_user_id::text = app_current_user_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  company_id::text = app_current_company_id()
  OR portal_user_id::text = app_current_user_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
);

-- company_leads
ALTER TABLE company_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_leads FORCE ROW LEVEL SECURITY;

CREATE POLICY company_leads_policy ON company_leads FOR ALL USING (
  company_id::text = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  company_id::text = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
);

-- interventions (technician-scoped for MEMBER)
ALTER TABLE interventions ENABLE ROW LEVEL SECURITY;
ALTER TABLE interventions FORCE ROW LEVEL SECURITY;

CREATE POLICY interventions_policy ON interventions FOR ALL USING (
  app_can_access_intervention(company_id, technician_id)
) WITH CHECK (
  app_user_role() = 'PLATFORM_ADMIN'
  OR (
    company_id = app_current_company_id()
    AND (
      app_current_company_role() IN ('OWNER', 'MANAGER')
      OR (
        app_current_company_role() = 'MEMBER'
        AND technician_id IS NOT NULL
        AND technician_id = app_current_member_id()
      )
    )
  )
);

-- company_invitations
ALTER TABLE company_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_invitations FORCE ROW LEVEL SECURITY;

CREATE POLICY company_invitations_policy ON company_invitations FOR ALL USING (
  company_id::text = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  company_id::text = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
);

-- company_subscriptions
ALTER TABLE company_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_subscriptions FORCE ROW LEVEL SECURITY;

CREATE POLICY company_subscriptions_policy ON company_subscriptions FOR ALL USING (
  company_id::text = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  company_id::text = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
);

-- company_services (tenant + public catalog read)
ALTER TABLE company_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_services FORCE ROW LEVEL SECURITY;

CREATE POLICY company_services_policy ON company_services FOR ALL USING (
  company_id::text = app_current_company_id()
  OR (
    is_published = true
    AND EXISTS (
      SELECT 1 FROM companies c
      WHERE c.id = company_services.company_id
        AND c.is_published = true
        AND c.is_verified = true
    )
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  company_id::text = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
);

-- quotes & lines
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes FORCE ROW LEVEL SECURITY;

CREATE POLICY quotes_policy ON quotes FOR ALL USING (
  company_id::text = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  company_id::text = app_current_company_id()
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

-- invoices
ALTER TABLE company_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_invoices FORCE ROW LEVEL SECURITY;

CREATE POLICY company_invoices_policy ON company_invoices FOR ALL USING (
  company_id::text = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  company_id::text = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
);

-- payments
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

-- reviews
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

-- gallery, consents, badges
ALTER TABLE company_gallery_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_gallery_images FORCE ROW LEVEL SECURITY;

CREATE POLICY company_gallery_images_policy ON company_gallery_images FOR ALL USING (
  company_id = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  company_id = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
);

ALTER TABLE company_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_consents FORCE ROW LEVEL SECURITY;

CREATE POLICY company_consents_policy ON company_consents FOR ALL USING (
  company_id = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  company_id = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
);

ALTER TABLE badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE badges FORCE ROW LEVEL SECURITY;

CREATE POLICY badges_policy ON badges FOR ALL USING (
  company_id IS NULL
  OR company_id = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  company_id IS NULL
  OR company_id = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
);

-- portal
ALTER TABLE portal_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_invitations FORCE ROW LEVEL SECURITY;

CREATE POLICY portal_invitations_policy ON portal_invitations FOR ALL USING (
  EXISTS (
    SELECT 1 FROM company_customers cc
    WHERE cc.id = portal_invitations.customer_id
      AND (
        cc.company_id = app_current_company_id()
        OR cc.portal_user_id = app_current_user_id()
      )
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM company_customers cc
    WHERE cc.id = portal_invitations.customer_id
      AND cc.company_id = app_current_company_id()
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
);

ALTER TABLE company_customer_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_customer_documents FORCE ROW LEVEL SECURITY;

CREATE POLICY company_customer_documents_policy ON company_customer_documents FOR ALL USING (
  EXISTS (
    SELECT 1 FROM company_customers cc
    WHERE cc.id = company_customer_documents.customer_id
      AND (
        cc.company_id = app_current_company_id()
        OR cc.portal_user_id = app_current_user_id()
      )
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM company_customers cc
    WHERE cc.id = company_customer_documents.customer_id
      AND cc.company_id = app_current_company_id()
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
);

-- intervention children
ALTER TABLE intervention_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE intervention_notes FORCE ROW LEVEL SECURITY;

CREATE POLICY intervention_notes_policy ON intervention_notes FOR ALL USING (
  EXISTS (
    SELECT 1 FROM interventions i
    WHERE i.id = intervention_notes.intervention_id
      AND app_can_access_intervention(i.company_id, i.technician_id)
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM interventions i
    WHERE i.id = intervention_notes.intervention_id
      AND app_can_access_intervention(i.company_id, i.technician_id)
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
);

ALTER TABLE intervention_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE intervention_status_history FORCE ROW LEVEL SECURITY;

CREATE POLICY intervention_status_history_policy ON intervention_status_history FOR ALL USING (
  EXISTS (
    SELECT 1 FROM interventions i
    WHERE i.id = intervention_status_history.intervention_id
      AND app_can_access_intervention(i.company_id, i.technician_id)
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM interventions i
    WHERE i.id = intervention_status_history.intervention_id
      AND app_can_access_intervention(i.company_id, i.technician_id)
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
);

ALTER TABLE intervention_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE intervention_photos FORCE ROW LEVEL SECURITY;

CREATE POLICY intervention_photos_policy ON intervention_photos FOR ALL USING (
  EXISTS (
    SELECT 1 FROM interventions i
    WHERE i.id = intervention_photos.intervention_id
      AND app_can_access_intervention(i.company_id, i.technician_id)
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM interventions i
    WHERE i.id = intervention_photos.intervention_id
      AND app_can_access_intervention(i.company_id, i.technician_id)
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
);

-- estimates
ALTER TABLE estimate_blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_blueprints FORCE ROW LEVEL SECURITY;

CREATE POLICY estimate_blueprints_read ON estimate_blueprints FOR SELECT USING (true);

ALTER TABLE estimate_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_projects FORCE ROW LEVEL SECURITY;

CREATE POLICY estimate_projects_policy ON estimate_projects FOR ALL USING (
  company_id::text = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  company_id::text = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
);

ALTER TABLE estimate_site_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_site_plans FORCE ROW LEVEL SECURITY;

CREATE POLICY estimate_site_plans_policy ON estimate_site_plans FOR ALL USING (
  EXISTS (
    SELECT 1 FROM estimate_projects ep
    WHERE ep.id = estimate_site_plans.project_id
      AND ep.company_id::text = app_current_company_id()
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM estimate_projects ep
    WHERE ep.id = estimate_site_plans.project_id
      AND ep.company_id::text = app_current_company_id()
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
);

ALTER TABLE estimate_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_stages FORCE ROW LEVEL SECURITY;

CREATE POLICY estimate_stages_policy ON estimate_stages FOR ALL USING (
  EXISTS (
    SELECT 1 FROM estimate_projects ep
    WHERE ep.id = estimate_stages.project_id
      AND ep.company_id::text = app_current_company_id()
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM estimate_projects ep
    WHERE ep.id = estimate_stages.project_id
      AND ep.company_id::text = app_current_company_id()
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
);

ALTER TABLE estimate_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_lines FORCE ROW LEVEL SECURITY;

CREATE POLICY estimate_lines_policy ON estimate_lines FOR ALL USING (
  EXISTS (
    SELECT 1 FROM estimate_stages es
    JOIN estimate_projects ep ON ep.id = es.project_id
    WHERE es.id = estimate_lines.stage_id
      AND ep.company_id::text = app_current_company_id()
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM estimate_stages es
    JOIN estimate_projects ep ON ep.id = es.project_id
    WHERE es.id = estimate_lines.stage_id
      AND ep.company_id::text = app_current_company_id()
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
);

ALTER TABLE estimate_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_measurements FORCE ROW LEVEL SECURITY;

CREATE POLICY estimate_measurements_policy ON estimate_measurements FOR ALL USING (
  EXISTS (
    SELECT 1 FROM estimate_projects ep
    WHERE ep.id = estimate_measurements.project_id
      AND ep.company_id::text = app_current_company_id()
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM estimate_projects ep
    WHERE ep.id = estimate_measurements.project_id
      AND ep.company_id::text = app_current_company_id()
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
);
