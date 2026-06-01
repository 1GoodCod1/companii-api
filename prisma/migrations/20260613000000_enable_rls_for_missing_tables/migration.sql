-- 1. estimate_comments
ALTER TABLE estimate_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_comments FORCE ROW LEVEL SECURITY;
CREATE POLICY estimate_comments_policy ON estimate_comments FOR ALL USING (
  EXISTS (
    SELECT 1 FROM estimate_projects ep
    WHERE ep.id = estimate_comments.project_id
      AND ep.company_id::text = app_current_company_id()
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM estimate_projects ep
    WHERE ep.id = estimate_comments.project_id
      AND ep.company_id::text = app_current_company_id()
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
);

-- 2. estimate_versions
ALTER TABLE estimate_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY estimate_versions_policy ON estimate_versions FOR ALL USING (
  EXISTS (
    SELECT 1 FROM estimate_projects ep
    WHERE ep.id = estimate_versions.project_id
      AND ep.company_id::text = app_current_company_id()
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM estimate_projects ep
    WHERE ep.id = estimate_versions.project_id
      AND ep.company_id::text = app_current_company_id()
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
);

-- 3. estimate_receipts
ALTER TABLE estimate_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY estimate_receipts_policy ON estimate_receipts FOR ALL USING (
  company_id::text = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  company_id::text = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
);

-- 4. estimate_templates
ALTER TABLE estimate_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_templates FORCE ROW LEVEL SECURITY;
CREATE POLICY estimate_templates_policy ON estimate_templates FOR ALL USING (
  company_id::text = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  company_id::text = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
);

-- 5. crews
ALTER TABLE crews ENABLE ROW LEVEL SECURITY;
ALTER TABLE crews FORCE ROW LEVEL SECURITY;
CREATE POLICY crews_policy ON crews FOR ALL USING (
  company_id::text = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  company_id::text = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
);

-- 6. crew_members
ALTER TABLE crew_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_members FORCE ROW LEVEL SECURITY;
CREATE POLICY crew_members_policy ON crew_members FOR ALL USING (
  EXISTS (
    SELECT 1 FROM crews c
    WHERE c.id = crew_members.crew_id
      AND c.company_id::text = app_current_company_id()
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM crews c
    WHERE c.id = crew_members.crew_id
      AND c.company_id::text = app_current_company_id()
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
);

-- 7. intervention_assignments
ALTER TABLE intervention_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE intervention_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY intervention_assignments_policy ON intervention_assignments FOR ALL USING (
  EXISTS (
    SELECT 1 FROM interventions i
    WHERE i.id = intervention_assignments.intervention_id
      AND i.company_id::text = app_current_company_id()
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM interventions i
    WHERE i.id = intervention_assignments.intervention_id
      AND i.company_id::text = app_current_company_id()
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
);

-- 8. estimate_project_photos
ALTER TABLE estimate_project_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_project_photos FORCE ROW LEVEL SECURITY;
CREATE POLICY estimate_project_photos_policy ON estimate_project_photos FOR ALL USING (
  EXISTS (
    SELECT 1 FROM estimate_projects ep
    WHERE ep.id = estimate_project_photos.project_id
      AND ep.company_id::text = app_current_company_id()
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM estimate_projects ep
    WHERE ep.id = estimate_project_photos.project_id
      AND ep.company_id::text = app_current_company_id()
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
);

-- 9. estimate_applied_mutations
ALTER TABLE estimate_applied_mutations ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_applied_mutations FORCE ROW LEVEL SECURITY;
CREATE POLICY estimate_applied_mutations_policy ON estimate_applied_mutations FOR ALL USING (
  EXISTS (
    SELECT 1 FROM estimate_projects ep
    WHERE ep.id = estimate_applied_mutations.project_id
      AND ep.company_id::text = app_current_company_id()
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM estimate_projects ep
    WHERE ep.id = estimate_applied_mutations.project_id
      AND ep.company_id::text = app_current_company_id()
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
);

-- Grant privileges to companii_app role
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO companii_app;
