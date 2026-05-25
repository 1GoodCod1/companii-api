-- Dual-owner sync: company.owner_user_id <-> company_members.role = 'OWNER'

-- Backfill: demote ACTIVE OWNER members that are not the legal owner
UPDATE company_members cm
SET role = 'MANAGER'
FROM companies c
WHERE cm.company_id = c.id
  AND cm.status = 'ACTIVE'
  AND cm.role = 'OWNER'
  AND cm.user_id <> c.owner_user_id;

-- Backfill: promote legal owner's active membership to OWNER
UPDATE company_members cm
SET role = 'OWNER'
FROM companies c
WHERE cm.company_id = c.id
  AND cm.user_id = c.owner_user_id
  AND cm.status = 'ACTIVE'
  AND cm.role <> 'OWNER';

-- Backfill: create OWNER membership when missing
INSERT INTO company_members (
  id,
  company_id,
  user_id,
  role,
  status,
  is_active,
  joined_at,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid()::text,
  c.id,
  c.owner_user_id,
  'OWNER',
  'ACTIVE',
  true,
  NOW(),
  NOW(),
  NOW()
FROM companies c
WHERE NOT EXISTS (
  SELECT 1
  FROM company_members cm
  WHERE cm.company_id = c.id
    AND cm.user_id = c.owner_user_id
);

UPDATE company_members cm
SET role = 'OWNER', status = 'ACTIVE', is_active = true
FROM companies c
WHERE cm.company_id = c.id
  AND cm.user_id = c.owner_user_id
  AND cm.status <> 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS company_members_one_active_owner_idx
  ON company_members (company_id)
  WHERE status = 'ACTIVE' AND role = 'OWNER';

CREATE OR REPLACE FUNCTION validate_company_owner_sync() RETURNS TRIGGER AS $$
DECLARE
  v_owner_user_id text;
BEGIN
  IF TG_TABLE_NAME = 'companies' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM company_members cm
      WHERE cm.company_id = NEW.id
        AND cm.user_id = NEW.owner_user_id
        AND cm.status = 'ACTIVE'
        AND cm.role = 'OWNER'
    ) THEN
      RAISE EXCEPTION 'owner_user_id must match an active company member with role OWNER';
    END IF;
  ELSIF TG_TABLE_NAME = 'company_members' THEN
    SELECT owner_user_id INTO v_owner_user_id FROM companies WHERE id = NEW.company_id;

    IF NEW.status = 'ACTIVE' AND NEW.role = 'OWNER' THEN
      IF v_owner_user_id IS DISTINCT FROM NEW.user_id THEN
        RAISE EXCEPTION 'active OWNER member must match company owner_user_id';
      END IF;
    END IF;

    IF NEW.status = 'ACTIVE'
      AND v_owner_user_id = NEW.user_id
      AND NEW.role <> 'OWNER' THEN
      RAISE EXCEPTION 'company legal owner must have role OWNER while membership is active';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_companies_owner_sync ON companies;
CREATE CONSTRAINT TRIGGER trg_companies_owner_sync
  AFTER INSERT OR UPDATE OF owner_user_id ON companies
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION validate_company_owner_sync();

DROP TRIGGER IF EXISTS trg_company_members_owner_sync ON company_members;
CREATE CONSTRAINT TRIGGER trg_company_members_owner_sync
  AFTER INSERT OR UPDATE OF role, status, user_id ON company_members
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION validate_company_owner_sync();
