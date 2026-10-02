-- Run once as the RDS managed master through a private administrative connection.
-- Set passwords afterwards with psql's \password, never literal SQL in shell history.
-- This script deliberately fails if the roles already exist; do not run it per release.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE ROLE talentos_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE talentos_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT talentos_migrator TO talentos_owner;
REVOKE ALL ON DATABASE talentos FROM PUBLIC;
GRANT CONNECT ON DATABASE talentos TO talentos_migrator, talentos_runtime;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO talentos_migrator;
GRANT USAGE ON SCHEMA public TO talentos_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE talentos_migrator IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO talentos_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE talentos_migrator IN SCHEMA public
    GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO talentos_runtime;
-- For a migrated existing database, run these grants after verifying ownership:
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO talentos_runtime;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO talentos_runtime;
