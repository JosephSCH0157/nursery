-- Read-only cumulative contract: no fixtures, writes or inferred lineage.
with stage as (select case when to_regclass('tongs.storage_quarantine_objects') is not null then 4
 when to_regclass('tongs.subscription_refresh_fences') is not null then 3
 when exists(select 1 from pg_trigger where tgname='forge_storage_capacity_statement_guard' and tgrelid='storage.objects'::regclass) then 2
 when to_regprocedure('tongs.read_my_storage_capacity()') is not null then 1 else 0 end as n),
functions(first_stage,signature,allowed_role) as (values (1,'_storage_capacity_workspace(text,text)',''),
(1,'_storage_capacity_temporary(text,text)',''),
(1,'_storage_capacity_entitlement(uuid)',''),
(1,'_storage_capacity_usage(uuid,uuid)',''),
(1,'_enforce_storage_capacity()',''),
(1,'read_my_storage_capacity()','authenticated'),
(3,'_immutable_subscription_evidence()',''),
(3,'_guard_subscription_refresh()',''),
(3,'begin_subscription_refresh(text,boolean,text)','service_role'),
(3,'commit_subscription_refresh(text,boolean,uuid,jsonb,jsonb)','service_role'),
(4,'_storage_quarantine_identity(storage.objects)',''),
(4,'_require_storage_quarantine_operator()',''),
(4,'_storage_quarantine_matches(storage.objects)',''),
(4,'_guard_storage_quarantine()',''),
(4,'observe_storage_quarantine(uuid[])','authenticated'),
(4,'approve_storage_quarantine(uuid,text,text)','authenticated'),
(4,'read_storage_quarantine_accounting()','authenticated')),
tables(first_stage,name) as (values (3,'subscription_refresh_fences'),
(3,'subscription_refresh_commits'),
(3,'subscription_service_periods'),
(4,'storage_quarantine_observations'),
(4,'storage_quarantine_authorizations'),
(4,'storage_quarantine_objects'),
(4,'storage_quarantine_deletions')),
triggers(first_stage,relation,name,deferred) as (values (1,'storage.objects','forge_storage_capacity_guard',true),
(2,'storage.objects','forge_storage_capacity_statement_guard',false),
(3,'tongs.billing_subscriptions','billing_subscription_refresh_guard',false),
(3,'tongs.subscription_refresh_commits','immutable_subscription_refresh_commits',false),
(3,'tongs.subscription_service_periods','immutable_subscription_service_periods',false),
(4,'storage.objects','forge_storage_quarantine_guard',false),
(4,'storage.objects','forge_storage_00_quarantine_final_guard',false),
(4,'tongs.storage_quarantine_observations','immutable_evidence',false),
(4,'tongs.storage_quarantine_authorizations','immutable_evidence',false),
(4,'tongs.storage_quarantine_objects','immutable_evidence',false),
(4,'tongs.storage_quarantine_deletions','immutable_evidence',false))
select n as storage_stage, tongs._current_financial_environment() as financial_mode,
 (not exists(select 1 from functions f left join pg_proc p on p.oid=to_regprocedure('tongs.'||f.signature)
 where (f.first_stage<=n and (p.oid is null or pg_get_userbyid(p.proowner)<>'postgres' or p.prosecdef is distinct from (f.signature not in ('_immutable_subscription_evidence()','_storage_capacity_temporary(text,text)','_storage_quarantine_identity(storage.objects)')) or not ('search_path=pg_catalog'=any(coalesce(p.proconfig,array[]::text[])))
 or exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
 where a.privilege_type='EXECUTE' and a.grantee<>p.proowner and (a.grantee=0 or pg_get_userbyid(a.grantee)<>f.allowed_role))
 or (f.allowed_role<>'' and not has_function_privilege(f.allowed_role,p.oid,'EXECUTE'))))
 or (f.first_stage>n and p.oid is not null))
 and not exists(select 1 from tables t left join pg_class c on c.oid=to_regclass('tongs.'||t.name)
 where (t.first_stage<=n and (c.oid is null or not c.relrowsecurity or pg_get_userbyid(c.relowner)<>'postgres'
 or exists(select 1 from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where a.grantee<>c.relowner)
 or exists(select 1 from pg_policy pp where pp.polrelid=c.oid))) or (t.first_stage>n and c.oid is not null))
 and not exists(select 1 from triggers r left join pg_trigger t on t.tgrelid=to_regclass(r.relation) and t.tgname=r.name
 where (r.first_stage<=n and (t.oid is null or t.tgenabled<>'O' or t.tgdeferrable<>r.deferred or t.tginitdeferred<>r.deferred or t.tgfoid is distinct from to_regprocedure(case when r.name in ('forge_storage_capacity_guard','forge_storage_capacity_statement_guard') then 'tongs._enforce_storage_capacity()' when r.name='billing_subscription_refresh_guard' then 'tongs._guard_subscription_refresh()' when r.name in ('forge_storage_quarantine_guard','forge_storage_00_quarantine_final_guard') then 'tongs._guard_storage_quarantine()' else 'tongs._immutable_subscription_evidence()' end)))
 or (r.first_stage>n and t.oid is not null))) as storage_contract_ok
 from stage;
