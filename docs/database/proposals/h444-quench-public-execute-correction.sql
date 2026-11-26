-- NOT APPROVED. No current canonical hosted entrypoint permits this operation.
-- Proposed payload ONLY; not a migration, executor, or source authorization.
-- Requires approved source/TLS/H444-history/recovery envelope, independent full
-- catalog before/after review, exclusive DDL coordination and single-use dispatch.
-- approved_before_sha256 / approved_after_sha256 are independently supplied
-- fingerprints of the exact ordered records below, not generated approvals.
\set ON_ERROR_STOP on
\if :{?approved_before_sha256}
\else
DO $$ BEGIN RAISE EXCEPTION 'QUENCH_ACL_HOLD_MISSING_BEFORE_PIN'; END $$;
\endif
\if :{?approved_after_sha256}
\else
DO $$ BEGIN RAISE EXCEPTION 'QUENCH_ACL_HOLD_MISSING_AFTER_PIN'; END $$;
\endif
BEGIN ISOLATION LEVEL SERIALIZABLE;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';
SET LOCAL idle_in_transaction_session_timeout='30s';
SET LOCAL transaction_timeout='60s';
SET LOCAL search_path=pg_catalog;
SELECT set_config('forge.quench_acl.expected_before', :'approved_before_sha256', true),
       set_config('forge.quench_acl.expected_after', :'approved_after_sha256', true);
DO $correction$
DECLARE
  phase integer;
  item record;
  function_oid oid;
  records jsonb;
  observed jsonb;
  expected_acl jsonb;
  digest text;
  expected_digest text;
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres'
     OR current_database() <> 'postgres'
     OR current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999
  THEN RAISE EXCEPTION 'QUENCH_ACL_HOLD_OPERATOR_OR_DATABASE'; END IF;
  FOR phase IN 0..1 LOOP
    records := '[]'::jsonb;
    SELECT jsonb_agg(jsonb_build_object('grantee',grantee,'grantor','postgres',
             'privilege','EXECUTE','grantable',false) ORDER BY grantee COLLATE "C")
      INTO expected_acl FROM (VALUES ('PUBLIC'),('authenticated'),('postgres'),('service_role')) g(grantee)
      WHERE phase=0 OR grantee <> 'PUBLIC';
    FOR item IN SELECT * FROM (VALUES
      ('tongs.enqueue_youtube_publication_job(uuid,uuid,uuid)',
       'aa751eb4de581055b0b3284d566990336ad27b92e9a8ceaa8e079a85106ff7c7'),
      ('tongs.finalize_quench_destination_package(uuid,uuid,uuid,uuid,uuid,text,integer,text,uuid,jsonb)',
       'f535a58d9c2787b83810ce0d980427f345e45dc31d161553130191a54f89267d'),
      ('tongs.retry_youtube_publication_stage(uuid,uuid,uuid)',
       'd9cae8b90990d02245a74a2b527134ef03c046712f2dab75852d7229cd0e992f')
    ) v(identity,definition_sha256) ORDER BY identity COLLATE "C" LOOP
      function_oid := to_regprocedure(item.identity);
      IF function_oid IS NULL THEN RAISE EXCEPTION 'QUENCH_ACL_HOLD_MISSING_FUNCTION'; END IF;
      SELECT jsonb_build_object('identity',item.identity,'oid',p.oid::bigint,
        'owner',pg_get_userbyid(p.proowner),'securityDefiner',p.prosecdef,
        'config',p.proconfig,'definitionSha256',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),
        'acl',(SELECT jsonb_agg(jsonb_build_object(
          'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
          'grantor',pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable)
          ORDER BY (CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END) COLLATE "C",
                   pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type,a.is_grantable)
          FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a))
        INTO observed FROM pg_proc p WHERE p.oid=function_oid AND p.prokind='f';
      IF observed IS NULL OR observed->>'owner' <> 'postgres'
         OR observed->>'securityDefiner' <> 'true'
         OR observed->>'definitionSha256' <> item.definition_sha256
         OR observed->'acl' IS DISTINCT FROM expected_acl
      THEN RAISE EXCEPTION 'QUENCH_ACL_HOLD_DEFINITION_OR_ACL'; END IF;
      IF NOT has_function_privilege('authenticated',function_oid,'EXECUTE')
         OR NOT has_function_privilege('service_role',function_oid,'EXECUTE')
      THEN RAISE EXCEPTION 'QUENCH_ACL_HOLD_APPLICATION_GRANT'; END IF;
      IF phase=1 AND (has_function_privilege('anon',function_oid,'EXECUTE')
         OR has_function_privilege('pg_read_all_data',function_oid,'EXECUTE'))
      THEN RAISE EXCEPTION 'QUENCH_ACL_HOLD_EFFECTIVE_EXECUTE'; END IF;
      IF phase=1 AND EXISTS(SELECT FROM pg_roles WHERE rolname='forge_h444_acquire_01') THEN
        IF has_function_privilege('forge_h444_acquire_01',function_oid,'EXECUTE')
        THEN RAISE EXCEPTION 'QUENCH_ACL_HOLD_ACQUISITION_EXECUTE'; END IF;
      END IF;
      records := records || jsonb_build_array(observed);
    END LOOP;
    digest := encode(sha256(convert_to(records::text,'UTF8')),'hex');
    expected_digest := current_setting(CASE WHEN phase=0 THEN
      'forge.quench_acl.expected_before' ELSE 'forge.quench_acl.expected_after' END);
    IF expected_digest !~ '^[a-f0-9]{64}$' OR digest <> expected_digest
    THEN RAISE EXCEPTION 'QUENCH_ACL_HOLD_FINGERPRINT'; END IF;
    -- Provisional transaction evidence only. A receipt is not a commit witness.
    RAISE NOTICE 'QUENCH_ACL_PHASE_% SHA256=% RECORDS=%',phase,digest,records;
    IF phase=0 THEN
      REVOKE EXECUTE ON FUNCTION
        tongs.finalize_quench_destination_package(uuid,uuid,uuid,uuid,uuid,text,integer,text,uuid,jsonb),
        tongs.enqueue_youtube_publication_job(uuid,uuid,uuid),
        tongs.retry_youtube_publication_stage(uuid,uuid,uuid)
      FROM PUBLIC;
    END IF;
  END LOOP;
END;
$correction$;
COMMIT;
-- A separate, fresh read-only PostVerify must confirm committed fingerprints,
-- complete catalog delta, unchanged six-column H444 history and safety evidence.
-- Lost response: NO retry and NO automatic GRANT back to PUBLIC.
