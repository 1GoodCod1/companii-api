ALTER POLICY estimate_receipts_policy ON estimate_receipts USING (
  company_id::text = app_current_company_id()
  OR EXISTS (
    SELECT 1 FROM estimate_projects ep
    WHERE ep.id = estimate_receipts.project_id
      AND app_owns_customer(ep.customer_id)
  )
  OR app_user_role() = 'PLATFORM_ADMIN'
);
