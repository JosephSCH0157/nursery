-- PROPOSAL ONLY. Hosted execution requires separate exact-procedure approval.
-- Run only after source/lineage and effective PUBLIC-capability review.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';
CREATE ROLE forge_h444_acquire_01 NOLOGIN PASSWORD NULL NOSUPERUSER
  NOCREATEDB NOCREATEROLE NOREPLICATION INHERIT BYPASSRLS
  CONNECTION LIMIT 2 VALID UNTIL '1970-01-01 00:00:00+00';
GRANT pg_read_all_data TO forge_h444_acquire_01
  WITH ADMIN FALSE, INHERIT TRUE, SET FALSE;
ALTER ROLE forge_h444_acquire_01 SET default_transaction_read_only=on;
ALTER ROLE forge_h444_acquire_01 SET row_security=off;
ALTER ROLE forge_h444_acquire_01 SET statement_timeout='30s';
ALTER ROLE forge_h444_acquire_01 SET lock_timeout='2s';
ALTER ROLE forge_h444_acquire_01 SET idle_in_transaction_session_timeout='10min';
ALTER ROLE forge_h444_acquire_01 SET transaction_timeout='10min';
ALTER ROLE forge_h444_acquire_01 SET work_mem='4MB';
ALTER ROLE forge_h444_acquire_01 SET max_parallel_workers_per_gather=0;
ALTER ROLE forge_h444_acquire_01 SET search_path=pg_catalog;
COMMIT;
