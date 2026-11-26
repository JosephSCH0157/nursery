-- PROPOSAL ONLY. Separate owner authorization includes this exact cleanup.
-- :expected_role_oid is a separately recorded, independently reviewed integer.
-- Never substitute a same-named replacement or suppress an unexpected failure.
\set ON_ERROR_STOP on
SET statement_timeout='30s';
SET lock_timeout='2s';
SET idle_in_transaction_session_timeout='30s';
SET transaction_timeout='30s';
SELECT count(*)=1 AS exact_role FROM pg_roles
WHERE rolname='forge_h444_acquire_01' AND oid=:'expected_role_oid'::oid \gset
\if :exact_role
BEGIN;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';
ALTER ROLE forge_h444_acquire_01 NOLOGIN PASSWORD NULL;
COMMIT;
-- Disabling login must commit BEFORE drain/drop; a dependency failure must not
-- roll back the credential revocation. Expiry alone never terminates sessions.
SELECT pg_terminate_backend(pid,5000) FROM pg_stat_activity
WHERE usesysid=:'expected_role_oid'::oid AND pid<>pg_backend_pid();
SELECT count(*)=0 AS drained FROM pg_stat_activity
WHERE usesysid=:'expected_role_oid'::oid \gset
\if :drained
BEGIN;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';
REVOKE pg_read_all_data FROM forge_h444_acquire_01;
DROP ROLE forge_h444_acquire_01;
COMMIT;
SELECT count(*)=0 AS role_removed FROM pg_roles
WHERE rolname='forge_h444_acquire_01' OR oid=:'expected_role_oid'::oid \gset
\if :role_removed
\echo H444_ROLE_REMOVAL_CONFIRMED
\else
DO $$BEGIN RAISE EXCEPTION 'H444_CLEANUP_HOLD_ROLE_REMAINS'; END$$;
\endif
\else
DO $$BEGIN RAISE EXCEPTION 'H444_CLEANUP_HOLD_SESSIONS_REMAIN'; END$$;
\endif
\else
DO $$BEGIN RAISE EXCEPTION 'H444_CLEANUP_HOLD_ROLE_IDENTITY'; END$$;
\endif
