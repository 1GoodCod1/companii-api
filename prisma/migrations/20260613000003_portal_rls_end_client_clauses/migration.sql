-- Multi-company portal RLS.
--
-- An END_CLIENT no longer carries a company in their RLS context (see
-- RlsInterceptor), so the existing `company_id = app_current_company_id()`
-- branches grant them nothing. Instead they may touch ONLY rows whose customer
-- belongs to them (portal_user_id = themselves) — across every company they are
-- a customer of. This enables the multi-company portal AND removes the prior
-- latent over-permission (an END_CLIENT used to have DB-level company-wide read).

-- Ownership helper: does the current user own this customer record?
-- NOTE: id/customer_id columns are TEXT (Prisma String), not the uuid type —
-- the parameter must be text to avoid a `text = uuid` operator error.
CREATE OR REPLACE FUNCTION app_owns_customer(p_customer_id text) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM company_customers cc
    WHERE cc.id = p_customer_id
      AND cc.portal_user_id = app_current_user_id()
  )
$$ LANGUAGE sql STABLE;

-- companies: an END_CLIENT must read the company embedded in their own
-- quotes/estimates/invoices even when it is not (yet) public.
ALTER POLICY companies_select ON companies USING (
  (is_published = true AND is_verified = true)
  OR id::text = app_current_company_id()
  OR owner_user_id::text = app_current_user_id()
  OR EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = companies.id
      AND cm.user_id::text = app_current_user_id()
      AND cm.status = 'ACTIVE'
  )
  OR EXISTS (
    SELECT 1 FROM company_customers cc
    WHERE cc.company_id = companies.id
      AND cc.portal_user_id::text = app_current_user_id()
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
);

-- company_leads (END_CLIENT: read own)
ALTER POLICY company_leads_policy ON company_leads USING (
  company_id::text = app_current_company_id()
  OR app_owns_customer(customer_id)
  OR app_user_role() = 'PLATFORM_ADMIN'
);

-- interventions (END_CLIENT: read own)
ALTER POLICY interventions_policy ON interventions USING (
  app_can_access_intervention(company_id, technician_id)
  OR app_owns_customer(customer_id)
);

-- quotes (END_CLIENT: read own + accept/reject status)
ALTER POLICY quotes_policy ON quotes USING (
  company_id::text = app_current_company_id()
  OR app_owns_customer(customer_id)
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  company_id::text = app_current_company_id()
  OR app_owns_customer(customer_id)
  OR app_user_role() = 'PLATFORM_ADMIN'
);

-- quote_lines (END_CLIENT: read own, via parent quote)
ALTER POLICY quote_lines_policy ON quote_lines USING (
  EXISTS (
    SELECT 1 FROM quotes q
    WHERE q.id = quote_lines.quote_id
      AND (q.company_id::text = app_current_company_id() OR app_owns_customer(q.customer_id))
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
);

-- company_invoices (END_CLIENT: read own + submit payment proof), via intervention.customer
ALTER POLICY company_invoices_policy ON company_invoices USING (
  company_id::text = app_current_company_id()
  OR EXISTS (
    SELECT 1 FROM interventions i
    WHERE i.id = company_invoices.intervention_id AND app_owns_customer(i.customer_id)
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  company_id::text = app_current_company_id()
  OR EXISTS (
    SELECT 1 FROM interventions i
    WHERE i.id = company_invoices.intervention_id AND app_owns_customer(i.customer_id)
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
);

-- company_reviews (END_CLIENT: read/create own)
ALTER POLICY company_reviews_policy ON company_reviews USING (
  company_id::text = app_current_company_id()
  OR author_user_id::text = app_current_user_id()
  OR app_owns_customer(customer_id)
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  company_id::text = app_current_company_id()
  OR author_user_id::text = app_current_user_id()
  OR app_owns_customer(customer_id)
  OR app_user_role() = 'PLATFORM_ADMIN'
);

-- estimate_projects (END_CLIENT: read own + accept/reject/request-changes)
ALTER POLICY estimate_projects_policy ON estimate_projects USING (
  company_id::text = app_current_company_id()
  OR app_owns_customer(customer_id)
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  company_id::text = app_current_company_id()
  OR app_owns_customer(customer_id)
  OR app_user_role() = 'PLATFORM_ADMIN'
);

-- estimate_stages (END_CLIENT: read own, via project)
ALTER POLICY estimate_stages_policy ON estimate_stages USING (
  EXISTS (
    SELECT 1 FROM estimate_projects ep
    WHERE ep.id = estimate_stages.project_id
      AND (ep.company_id::text = app_current_company_id() OR app_owns_customer(ep.customer_id))
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
);

-- estimate_lines (END_CLIENT: read own, via stage -> project)
ALTER POLICY estimate_lines_policy ON estimate_lines USING (
  EXISTS (
    SELECT 1 FROM estimate_stages es
    JOIN estimate_projects ep ON ep.id = es.project_id
    WHERE es.id = estimate_lines.stage_id
      AND (ep.company_id::text = app_current_company_id() OR app_owns_customer(ep.customer_id))
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
);

-- estimate_measurements (END_CLIENT: read own, via project)
ALTER POLICY estimate_measurements_policy ON estimate_measurements USING (
  EXISTS (
    SELECT 1 FROM estimate_projects ep
    WHERE ep.id = estimate_measurements.project_id
      AND (ep.company_id::text = app_current_company_id() OR app_owns_customer(ep.customer_id))
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
);

-- estimate_comments (END_CLIENT: read own + post CLIENT comments, via project)
ALTER POLICY estimate_comments_policy ON estimate_comments USING (
  EXISTS (
    SELECT 1 FROM estimate_projects ep
    WHERE ep.id = estimate_comments.project_id
      AND (ep.company_id::text = app_current_company_id() OR app_owns_customer(ep.customer_id))
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM estimate_projects ep
    WHERE ep.id = estimate_comments.project_id
      AND (ep.company_id::text = app_current_company_id() OR app_owns_customer(ep.customer_id))
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
);
