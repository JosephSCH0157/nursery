-- PROPOSED release epilogue, NOT approved for production. Run only after both
-- migrations, dormant-schema certification, and ACL verification have succeeded.
begin;
do $$ declare fn record; found integer:=0; begin
 if current_user<>'postgres' then raise exception 'postgres migration owner required'; end if;
 if (select count(*) from supabase_migrations.schema_migrations where version in('20261010120000','20261010130000'))<>2 then
  raise exception 'both research migrations must be recorded exactly once'; end if;
 for fn in select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='tongs' and (p.proname like '%owner_hearth_research%' or p.proname='_finish_owner_hearth_research_stage')
 loop
  found:=found+1;
  if exists(select 1 from aclexplode(fn.proacl) a where a.grantee=0)
   or has_function_privilege('anon',fn.oid,'EXECUTE')
   or has_function_privilege('authenticated',fn.oid,'EXECUTE')<>(fn.proname='record_owner_hearth_research_review')
   or not has_function_privilege('service_role',fn.oid,'EXECUTE') then
   raise exception 'research ACL verification failed: %',fn.proname; end if;
 end loop;
 if found<>21 then raise exception 'research function inventory mismatch'; end if;
 -- Require the exact guarded defaults; unexpected intervening DDL changes stop restoration.
 if (select array_agg(r.rolname::text order by r.rolname) from pg_default_acl d
      cross join lateral aclexplode(d.defaclacl) a join pg_roles r on r.oid=a.grantee
      where d.defaclrole='postgres'::regrole and d.defaclobjtype='f' and d.defaclnamespace='tongs'::regnamespace)
      is distinct from array['service_role']::text[] then raise exception 'guarded tongs defaults changed'; end if;
 if exists(select 1 from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a
      where d.defaclrole='postgres'::regrole and d.defaclobjtype='f' and d.defaclnamespace=0
        and (a.grantee<>'postgres'::regrole or a.grantor<>'postgres'::regrole or a.privilege_type<>'EXECUTE' or a.is_grantable)) then
  raise exception 'guarded global defaults changed'; end if;
end $$;
alter default privileges for role postgres grant execute on functions to public;
alter default privileges for role postgres in schema tongs grant execute on functions to authenticated;
commit;
