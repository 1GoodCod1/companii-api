-- Public read access for company gallery images.
--
-- Bug: gallery images saved in the cabinet did not appear on the public
-- company profile. The `company_gallery_images_policy` (FOR ALL) only allowed
-- rows where `company_id = app_current_company_id()` or PLATFORM_ADMIN, so an
-- anonymous visitor (no company context) received the company row but ZERO
-- gallery rows. `companies` (companies_select) and `company_services`
-- (company_services_policy) already expose a public-read clause for
-- published & verified companies — gallery was simply missing it.
--
-- Fix: add a permissive SELECT-only policy. PostgreSQL OR-combines permissive
-- policies per command, so this widens *read* access only; INSERT/UPDATE/DELETE
-- stay governed by the existing FOR ALL policy (owning company / admin).
CREATE POLICY company_gallery_images_public_select ON company_gallery_images
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM companies c
      WHERE c.id = company_gallery_images.company_id
        AND c.is_published = true
        AND c.is_verified = true
    )
  );
