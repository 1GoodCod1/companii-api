DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'companii_app') THEN
    CREATE ROLE companii_app LOGIN PASSWORD 'companii_app_pass' NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;

-- Grant schema usage
GRANT USAGE ON SCHEMA public TO companii_app;

-- Grant permissions to existing tables, sequences, and functions
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO companii_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO companii_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO companii_app;

-- Alter default privileges for future tables, sequences and functions
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO companii_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO companii_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO companii_app;
