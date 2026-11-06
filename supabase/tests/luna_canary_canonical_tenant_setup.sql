-- Disposable canonical Luna tenant proof. No hosted or financial activation.
do $guard$
begin
  if current_database()<>'postgres'
     or current_setting('forge.luna_canary_certification',true) is distinct from 'disposable-baseline-v1'
     or (select count(*) from forge_meta.database_lineage)<>1
     or not exists(select 1 from forge_meta.database_lineage where singleton and lineage='baseline-v1')
     or (select max(version) from supabase_migrations.schema_migrations) is distinct from '20261104071802'
     or exists(select 1 from auth.users where id in (
       'ce000000-0000-4000-8000-000000000001','ce000000-0000-4000-8000-000000000002'))
     or not (select relrowsecurity from pg_class where oid='tongs.workspaces'::regclass)
     or not (select relrowsecurity from pg_class where oid='tongs.org_members'::regclass) then
    raise exception 'Luna tenant proof requires the exact guarded disposable baseline' using errcode='42501';
  end if;
end $guard$;

create temp table luna_original_state(relation_name text primary key,fingerprint text);
do $snapshot$
declare r record; v_hash text;
begin
  for r in
    select c.oid::regclass::text relation_name
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where (n.nspname='tongs' and c.relkind in ('r','p'))
       or (n.nspname='auth' and c.relname='users')
  loop
    execute format('select md5(coalesce(string_agg(to_jsonb(x)::text,E''\n'' order by to_jsonb(x)::text),'''')) from %s x',r.relation_name) into v_hash;
    insert into luna_original_state values(r.relation_name,v_hash);
  end loop;
end $snapshot$;

create function pg_temp.assert_luna_original_state() returns void
language plpgsql as $verify$
declare r record; v_hash text;
begin
  for r in select * from pg_temp.luna_original_state loop
    execute format('select md5(coalesce(string_agg(to_jsonb(x)::text,E''\n'' order by to_jsonb(x)::text),'''')) from %s x',r.relation_name) into v_hash;
    if v_hash is distinct from r.fingerprint then
      raise exception 'Luna fixture changed original data in %',r.relation_name;
    end if;
  end loop;
end $verify$;

begin;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
 ('ce000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','canary-operator@example.test','',now(),now(),now()),
 ('ce000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','canary-customer@example.test','',now(),now(),now());
insert into tongs.workspaces(id,name,created_by,org_id)
values('ce000000-0000-4000-8000-000000000010','Customer canary proof',
 'ce000000-0000-4000-8000-000000000002',tongs.ensure_personal_org('ce000000-0000-4000-8000-000000000002'));
-- Canonical trigger provisions the owner row; assert it below without rewriting it.
insert into tongs.platform_operators(user_id,reason,granted_by)
values('ce000000-0000-4000-8000-000000000001','isolated customer canary proof','ce000000-0000-4000-8000-000000000001');

do $ownership$
declare v_org uuid;
begin
  select w.org_id into strict v_org from tongs.workspaces w
    where w.id='ce000000-0000-4000-8000-000000000010'
      and w.created_by='ce000000-0000-4000-8000-000000000002';
  if not exists(select 1 from tongs.orgs where id=v_org
                 and personal_owner_user_id='ce000000-0000-4000-8000-000000000002')
     or not exists(select 1 from tongs.org_members where org_id=v_org
                    and user_id='ce000000-0000-4000-8000-000000000002' and org_role='owner')
     or exists(select 1 from tongs.org_members where org_id=v_org
                and user_id='ce000000-0000-4000-8000-000000000001')
     or not exists(select 1 from tongs.workspace_members
       where workspace_id='ce000000-0000-4000-8000-000000000010'
         and user_id='ce000000-0000-4000-8000-000000000002' and role='owner') then
    raise exception 'Luna workspace organization or owner membership is incorrect';
  end if;
end $ownership$;

set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='ce000000-0000-4000-8000-000000000002';
set local role authenticated;
do $customer_read$
begin
  if (select count(*) from tongs.workspaces where id='ce000000-0000-4000-8000-000000000010')<>1 then
    raise exception 'Customer cannot read its own canary workspace through RLS';
  end if;
end $customer_read$;
reset role;
set local request.jwt.claim.sub='ce000000-0000-4000-8000-000000000001';
set local role authenticated;
do $cross_tenant$
declare v_updated bigint;
begin
  if exists(select 1 from tongs.workspaces where id='ce000000-0000-4000-8000-000000000010') then
    raise exception 'Operator crossed tenant RLS into the customer workspace';
  end if;
  update tongs.workspaces set name='forbidden cross-tenant update'
    where id='ce000000-0000-4000-8000-000000000010';
  get diagnostics v_updated=row_count;
  if v_updated<>0 then raise exception 'Cross-tenant workspace update escaped RLS'; end if;
end $cross_tenant$;
reset role;
rollback;
select pg_temp.assert_luna_original_state();
select 'Luna tenant ownership, authenticated RLS denial and rollback integrity passed' as certification;
