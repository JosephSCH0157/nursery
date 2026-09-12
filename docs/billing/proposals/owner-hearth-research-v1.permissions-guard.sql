-- PROPOSED release prelude, NOT a migration and NOT approved for production.
-- Requires a coordinated postgres DDL-only maintenance window. Existing function
-- ACLs and all ordinary chat/application writes are untouched. If either migration
-- or verification fails, leave this guard installed; do not restore defaults.
begin;
do $$ begin
 if current_user<>'postgres' then raise exception 'postgres migration owner required'; end if;
 if exists(select 1 from pg_default_acl d where d.defaclrole='postgres'::regrole and d.defaclobjtype='f' and d.defaclnamespace=0) then
  raise exception 'global function defaults differ from reviewed implicit defaults'; end if;
 if (select array_agg(r.rolname::text order by r.rolname) from pg_default_acl d
      cross join lateral aclexplode(d.defaclacl) a join pg_roles r on r.oid=a.grantee
      where d.defaclrole='postgres'::regrole and d.defaclobjtype='f' and d.defaclnamespace='tongs'::regnamespace)
      is distinct from array['authenticated','service_role']::text[] then
  raise exception 'tongs function defaults differ from reviewed production defaults'; end if;
 if exists(select 1 from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a
     where d.defaclrole='postgres'::regrole and d.defaclobjtype='f' and d.defaclnamespace='tongs'::regnamespace
       and (a.grantor<>'postgres'::regrole or a.privilege_type<>'EXECUTE' or a.is_grantable)) then
  raise exception 'unexpected function default privilege properties'; end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='tongs' and p.proname in('_owner_hearth_research_latest_authorization','_finish_owner_hearth_research_stage')) then
  raise exception 'guard must precede original research function creation'; end if;
end $$;
-- A per-schema REVOKE cannot subtract the global implicit PUBLIC default.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema tongs revoke execute on functions from authenticated,anon;
create function tongs._owner_research_acl_guard_probe() returns integer language sql security definer set search_path=pg_catalog as 'select 1';
do $$ begin
 if has_function_privilege('anon','tongs._owner_research_acl_guard_probe()','EXECUTE')
  or has_function_privilege('authenticated','tongs._owner_research_acl_guard_probe()','EXECUTE')
  or exists(select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a
       where p.oid='tongs._owner_research_acl_guard_probe()'::regprocedure and a.grantee=0) then
  raise exception 'function creation quarantine failed'; end if;
end $$;
drop function tongs._owner_research_acl_guard_probe();
commit;
