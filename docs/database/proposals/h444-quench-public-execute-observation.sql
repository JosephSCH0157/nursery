-- PROPOSAL ONLY: bounded metadata observation; not approved for hosted execution.
-- Reuse for before-state and independently committed PostVerify. This three-object
-- fingerprint is NOT a full-catalog fingerprint or proof of project identity.
-- Source/TLS binding, H444 lineage/history, full catalog and independent approval
-- are separate mandatory evidence. Do not treat a computed digest as approval.
\set ON_ERROR_STOP on
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';
SET LOCAL idle_in_transaction_session_timeout='30s';
SET LOCAL transaction_timeout='60s';
SET LOCAL search_path=pg_catalog;
WITH targets(identity) AS (VALUES
 ('tongs.enqueue_youtube_publication_job(uuid,uuid,uuid)'),
 ('tongs.finalize_quench_destination_package(uuid,uuid,uuid,uuid,uuid,text,integer,text,uuid,jsonb)'),
 ('tongs.retry_youtube_publication_stage(uuid,uuid,uuid)')),
records AS (
 SELECT jsonb_agg(jsonb_build_object('identity',t.identity,'oid',p.oid::bigint,
   'owner',pg_get_userbyid(p.proowner),'securityDefiner',p.prosecdef,'config',p.proconfig,
   'definitionSha256',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),
   'acl',(SELECT jsonb_agg(jsonb_build_object(
     'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
     'grantor',pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable)
     ORDER BY (CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END) COLLATE "C",
              pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type,a.is_grantable)
     FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a))
   ORDER BY t.identity COLLATE "C") AS value, count(p.oid) AS found
 FROM targets t LEFT JOIN pg_proc p ON p.oid=to_regprocedure(t.identity) AND p.prokind='f')
SELECT jsonb_build_object('observedAt',clock_timestamp(),'database',current_database(),
 'principal',current_user,'sessionPrincipal',session_user,
 'snapshot',pg_current_snapshot()::text,'found',found,'records',value,'recordsCanonical',value::text,
 'recordsSha256',encode(sha256(convert_to(value::text,'UTF8')),'hex')) AS observation
FROM records;
ROLLBACK;
-- Require found=3. Independent reviewer predicts after-records by removing only
-- each PUBLIC EXECUTE ACL entry, preserving every other field and array order;
-- fingerprint UTF-8 PostgreSQL jsonb::text with SHA-256. Do not include the
-- observation time or snapshot identifier in recordsSha256. Retain them as provenance.
