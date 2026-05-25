-- Row-level security (multi-tenant)
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

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies FORCE ROW LEVEL SECURITY;

CREATE POLICY companies_select ON companies FOR SELECT USING (
  (is_published = true AND is_verified = true)
  OR id::text = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
);

CREATE POLICY companies_write ON companies FOR ALL USING (
  owner_user_id::text = app_current_user_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
);

ALTER TABLE company_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_members FORCE ROW LEVEL SECURITY;

CREATE POLICY company_members_policy ON company_members FOR ALL USING (
  company_id::text = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
);

ALTER TABLE company_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_customers FORCE ROW LEVEL SECURITY;

CREATE POLICY company_customers_policy ON company_customers FOR ALL USING (
  company_id::text = app_current_company_id()
  OR portal_user_id::text = app_current_user_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
);

ALTER TABLE interventions ENABLE ROW LEVEL SECURITY;
ALTER TABLE interventions FORCE ROW LEVEL SECURITY;

CREATE POLICY interventions_policy ON interventions FOR ALL USING (
  company_id::text = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
);
