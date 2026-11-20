-- Read-only successor contract. Compose with the unchanged through-446 contract.
with expected(name,event_type,columns,deferred) as (values
 ('forge_storage_capacity_guard',21,array[]::text[],true),
 ('forge_storage_capacity_statement_guard',21,array['metadata']::text[],false),
 ('forge_storage_capacity_identity_guard',17,array['id','bucket_id','name','version','owner','owner_id','user_metadata','created_at']::text[],false)),
 observed as (
 select e.*,t.oid,t.tgenabled,t.tgdeferrable,t.tginitdeferred,t.tgtype,t.tgfoid,
  array(select a.attname::text from unnest(t.tgattr::smallint[]) with ordinality x(attnum,n)
   join pg_attribute a on a.attrelid=t.tgrelid and a.attnum=x.attnum order by x.n) as actual_columns,
  substring(pg_get_triggerdef(t.oid) from ' WHEN (.*) EXECUTE FUNCTION ') as predicate
 from expected e left join pg_trigger t on t.tgrelid='storage.objects'::regclass and t.tgname=e.name)
select 7 as storage_stage,
 (exists(select 1 from pg_proc p where p.oid=to_regprocedure('tongs._enforce_storage_capacity()')
   and pg_get_userbyid(p.proowner)='postgres' and p.prosecdef
   and p.proconfig=array['search_path=pg_catalog']::text[]
   and encode(extensions.digest(convert_to(p.prosrc,'UTF8'),'sha256'),'hex')='7f5e696e47478221534810e84b263473d02141e65320d67ddf5a022dc60ea33d'
   and not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee<>p.proowner))
  and not exists(select 1 from observed where oid is null or tgenabled<>'O'
   or tgtype<>event_type or tgdeferrable<>deferred or tginitdeferred<>deferred
   or tgfoid<>to_regprocedure('tongs._enforce_storage_capacity()')
   or actual_columns<>columns
   or (deferred and predicate is not null)
   or (not deferred and predicate is distinct from '(((new.metadata ->> ''size''::text) IS NOT NULL))'))
 ) as storage_contract_ok;
