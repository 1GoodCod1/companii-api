-- Remaining tenant RLS + technician-scoped interventions

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

DROP POLICY IF EXISTS interventions_policy ON interventions;
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

ALTER TABLE package_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_bookings FORCE ROW LEVEL SECURITY;
CREATE POLICY package_bookings_policy ON package_bookings FOR ALL USING (
  company_id = app_current_company_id()
  OR app_user_role() = 'PLATFORM_ADMIN'
) WITH CHECK (
  company_id = app_current_company_id()
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

DROP POLICY IF EXISTS intervention_notes_policy ON intervention_notes;
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

DROP POLICY IF EXISTS intervention_status_history_policy ON intervention_status_history;
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
