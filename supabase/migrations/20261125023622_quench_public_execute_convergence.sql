-- Ordered shared-tail convergence only; never apply ahead of 445-447.
-- Preserves function definitions, ownership, search paths and application grants.
-- Does not repair the separate retry helper defect or grant execution authority.
BEGIN;
SET LOCAL search_path=pg_catalog;
DO $guard$
DECLARE item record; acl text[]; public_count integer:=0;
BEGIN
 FOR item IN SELECT * FROM (VALUES ('tongs.enqueue_youtube_publication_job(uuid,uuid,uuid)','aa751eb4de581055b0b3284d566990336ad27b92e9a8ceaa8e079a85106ff7c7'),
('tongs.finalize_quench_destination_package(uuid,uuid,uuid,uuid,uuid,text,integer,text,uuid,jsonb)','f535a58d9c2787b83810ce0d980427f345e45dc31d161553130191a54f89267d'),
('tongs.retry_youtube_publication_stage(uuid,uuid,uuid)','d9cae8b90990d02245a74a2b527134ef03c046712f2dab75852d7229cd0e992f')) v(identity,hash) LOOP
  IF NOT EXISTS(SELECT FROM pg_proc p WHERE p.oid=to_regprocedure(item.identity)
    AND p.proowner='postgres'::regrole AND p.prosecdef AND p.prokind='f'
    AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=item.hash)
  THEN RAISE EXCEPTION 'QUENCH_CONVERGENCE_DEFINITION_DRIFT'; END IF;
  SELECT array_agg(x::text ORDER BY x::text COLLATE "C") INTO acl FROM pg_proc p,
    LATERAL unnest(p.proacl) x WHERE p.oid=to_regprocedure(item.identity);
  IF acl=ARRAY['=X/postgres','authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']::text[] THEN
    public_count:=public_count+1;
  ELSIF acl IS DISTINCT FROM ARRAY['authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']::text[] THEN
    RAISE EXCEPTION 'QUENCH_CONVERGENCE_ACL_DRIFT';
  END IF;
 END LOOP;
 IF public_count NOT IN (0,3) THEN RAISE EXCEPTION 'QUENCH_CONVERGENCE_PARTIAL_STATE'; END IF;
END;
$guard$;
REVOKE EXECUTE ON FUNCTION tongs.enqueue_youtube_publication_job(uuid,uuid,uuid),
tongs.finalize_quench_destination_package(uuid,uuid,uuid,uuid,uuid,text,integer,text,uuid,jsonb),
tongs.retry_youtube_publication_stage(uuid,uuid,uuid) FROM PUBLIC;
DO $post$
DECLARE contract_valid boolean;
BEGIN
 SELECT storage_contract_ok INTO contract_valid FROM (WITH targets(identity,hash) AS (VALUES ('tongs.enqueue_youtube_publication_job(uuid,uuid,uuid)','aa751eb4de581055b0b3284d566990336ad27b92e9a8ceaa8e079a85106ff7c7'),
('tongs.finalize_quench_destination_package(uuid,uuid,uuid,uuid,uuid,text,integer,text,uuid,jsonb)','f535a58d9c2787b83810ce0d980427f345e45dc31d161553130191a54f89267d'),
('tongs.retry_youtube_publication_stage(uuid,uuid,uuid)','d9cae8b90990d02245a74a2b527134ef03c046712f2dab75852d7229cd0e992f')), checked AS (
SELECT p.oid,p.proowner='postgres'::regrole AND p.prosecdef AND p.prokind='f'
 AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=t.hash
 AND (SELECT array_agg(x::text ORDER BY x::text COLLATE "C") FROM unnest(p.proacl) x)
 = ARRAY['authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']::text[]
 AND has_function_privilege('authenticated',p.oid,'EXECUTE')
 AND has_function_privilege('service_role',p.oid,'EXECUTE')
 AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
 AND NOT has_function_privilege('pg_read_all_data',p.oid,'EXECUTE') AS ok
 FROM targets t LEFT JOIN pg_proc p ON p.oid=to_regprocedure(t.identity))
SELECT 8 AS storage_stage,count(oid)=3 AND coalesce(bool_and(coalesce(ok,false)),false) AS storage_contract_ok FROM checked) c;
 IF contract_valid IS DISTINCT FROM true THEN RAISE EXCEPTION 'QUENCH_CONVERGENCE_POSTVERIFY'; END IF;
END;
$post$;
COMMIT;
