begin;

do $$
declare
  v_owner tongs.account_authority_classifications%rowtype;
  v_event tongs.account_authority_classification_events%rowtype;
begin
  if (select count(*) from tongs.account_authority_classifications) <> 1 then
    raise exception 'exactly one verified owner was not backfilled';
  end if;
  select * into strict v_owner from tongs.account_authority_classifications;
  select * into strict v_event from tongs.account_authority_classification_events
    where user_id = v_owner.user_id and revision = 1;
  if v_owner.account_class <> 'owner' or v_owner.revision <> 1
     or v_owner.user_id <> (select user_id from tongs.owner_testing_principals where status = 'enabled')
     or v_event.account_class <> 'owner'
     or (v_event.evidence->>'legacy_principal_revision')::integer <> 1
     or v_event.evidence->>'migration_source' <> '20261011940000_canonical_account_owner_authority' then
    raise exception 'canonical owner backfill provenance is incorrect';
  end if;
end
$$;

insert into auth.users(id, email) values
  ('ca000000-0000-4000-8000-000000000001', 'account-authority-operator@example.test'),
  ('ca000000-0000-4000-8000-000000000002', 'account-authority-target@example.test'),
  ('ca000000-0000-4000-8000-000000000003', 'account-authority-nonoperator@example.test'),
  ('ca000000-0000-4000-8000-000000000004', 'account-authority-workspace-only@example.test'),
  ('ca000000-0000-4000-8000-000000000005', 'account-authority-platform-only@example.test'),
  ('ca000000-0000-4000-8000-000000000006', 'account-authority-credit-only@example.test');

insert into tongs.platform_operators(user_id, reason, granted_by) values
  ('ca000000-0000-4000-8000-000000000001', 'account authority test operator', 'ca000000-0000-4000-8000-000000000001'),
  ('ca000000-0000-4000-8000-000000000005', 'must not imply Forge owner', 'ca000000-0000-4000-8000-000000000001');
insert into tongs.orgs(id, name, created_by) values
  ('ca200000-0000-4000-8000-000000000001', 'Account authority isolation organization', 'ca000000-0000-4000-8000-000000000004');
insert into tongs.workspaces(id, name, org_id, created_by) values
  ('ca100000-0000-4000-8000-000000000001', 'Account authority isolation workspace', 'ca200000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000004');
insert into tongs.ai_credits(user_id, token_balance) values
  ('ca000000-0000-4000-8000-000000000006', 999999999);

do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'tongs'
      and c.relname in ('account_authority_classifications', 'account_authority_classification_events')
      and (not c.relrowsecurity or not c.relforcerowsecurity)
  ) then
    raise exception 'account authority tables are not protected by forced RLS';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'tongs'
      and tablename in ('account_authority_classifications', 'account_authority_classification_events')
  ) then
    raise exception 'account authority tables acquired a customer-facing RLS policy';
  end if;
  if has_table_privilege('authenticated', 'tongs.account_authority_classifications', 'select')
     or has_table_privilege('authenticated', 'tongs.account_authority_classification_events', 'select')
     or has_table_privilege('anon', 'tongs.account_authority_classifications', 'select')
     or has_table_privilege('anon', 'tongs.account_authority_classification_events', 'select') then
    raise exception 'customer-facing role can read account authority tables';
  end if;
  if has_table_privilege('authenticated', 'tongs.account_authority_classifications', 'insert,update,delete')
     or has_table_privilege('anon', 'tongs.account_authority_classifications', 'insert,update,delete') then
    raise exception 'customer-facing role can mutate account authority tables';
  end if;
  if has_function_privilege('authenticated', 'tongs.configure_account_authority_classification(uuid,uuid,text,text)', 'execute')
     or has_function_privilege('anon', 'tongs.configure_account_authority_classification(uuid,uuid,text,text)', 'execute')
     or has_function_privilege('authenticated', 'tongs.resolve_account_authority_classification(uuid)', 'execute')
     or has_function_privilege('anon', 'tongs.resolve_account_authority_classification(uuid)', 'execute')
     or has_function_privilege('authenticated', 'tongs.read_account_authority_classification(uuid,uuid)', 'execute')
     or has_function_privilege('anon', 'tongs.read_account_authority_classification(uuid,uuid)', 'execute') then
    raise exception 'customer-facing role can execute account authority RPCs';
  end if;
  if not has_function_privilege('service_role', 'tongs.configure_account_authority_classification(uuid,uuid,text,text)', 'execute')
     or not has_function_privilege('service_role', 'tongs.resolve_account_authority_classification(uuid)', 'execute')
     or not has_function_privilege('service_role', 'tongs.read_account_authority_classification(uuid,uuid)', 'execute') then
    raise exception 'service role lacks intended account authority RPC access';
  end if;
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'tongs'
      and p.proname in (
        'configure_account_authority_classification',
        'resolve_account_authority_classification',
        'read_account_authority_classification'
      )
      and not ('search_path=pg_catalog' = any(coalesce(p.proconfig, '{}'::text[])))
  ) then
    raise exception 'account authority security-definer function lacks pinned search_path';
  end if;
  if exists (
    with required_index(relation_name, column_name) as (
      values
        ('tongs.account_authority_classifications'::regclass, 'user_id'::text),
        ('tongs.account_authority_classifications'::regclass, 'configured_by'::text),
        ('tongs.account_authority_classification_events'::regclass, 'user_id'::text),
        ('tongs.account_authority_classification_events'::regclass, 'actor_id'::text)
    )
    select 1 from required_index required
    where not exists (
      select 1
      from pg_index index_metadata
      join pg_class index_relation on index_relation.oid = index_metadata.indexrelid
      join pg_am access_method on access_method.oid = index_relation.relam
      where index_metadata.indrelid = required.relation_name
        and index_metadata.indisvalid
        and index_metadata.indisready
        and access_method.amname = 'btree'
        and pg_get_indexdef(index_metadata.indexrelid, 1, true) = required.column_name
    )
  ) then
    raise exception 'account authority foreign-key index coverage is incomplete';
  end if;
end
$$;

select set_config('request.jwt.claim.role', 'authenticated', true);
do $$ begin
  begin
    perform tongs.configure_account_authority_classification(
      'ca000000-0000-4000-8000-000000000002',
      'ca000000-0000-4000-8000-000000000001', 'owner', 'authenticated rejection test');
    raise exception 'authenticated caller configured account authority';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.role', 'anon', true);
do $$ begin
  begin
    perform tongs.configure_account_authority_classification(
      'ca000000-0000-4000-8000-000000000002',
      'ca000000-0000-4000-8000-000000000001', 'owner', 'anonymous rejection test');
    raise exception 'anonymous caller configured account authority';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.role', 'service_role', true);
do $$ begin
  begin
    perform tongs.configure_account_authority_classification(
      'ca000000-0000-4000-8000-000000000002',
      'ca000000-0000-4000-8000-000000000003', 'owner', 'non-operator rejection test');
    raise exception 'non-operator service actor configured account authority';
  exception when insufficient_privilege then null; end;
end $$;

do $$
declare
  v_default jsonb;
  v_owner jsonb;
  v_customer jsonb;
  v_read jsonb;
begin
  v_default := tongs.resolve_account_authority_classification('ca000000-0000-4000-8000-000000000002');
  if v_default->>'account_class' <> 'customer' or (v_default->>'explicit')::boolean
     or v_default->>'revision' is not null then
    raise exception 'absent account authority did not resolve to implicit customer';
  end if;

  perform tongs.configure_account_authority_classification(
    'ca000000-0000-4000-8000-000000000002',
    'ca000000-0000-4000-8000-000000000001', 'owner', 'grant owner authority for isolated proof');
  v_owner := tongs.resolve_account_authority_classification('ca000000-0000-4000-8000-000000000002');
  if v_owner->>'account_class' <> 'owner' or (v_owner->>'revision')::integer <> 1
     or not (v_owner->>'explicit')::boolean then
    raise exception 'explicit owner classification did not resolve';
  end if;

  v_read := tongs.read_account_authority_classification(
    'ca000000-0000-4000-8000-000000000002',
    'ca000000-0000-4000-8000-000000000001');
  if v_read->>'account_class' <> 'owner' then
    raise exception 'guarded operator read did not return owner classification';
  end if;

  perform tongs.configure_account_authority_classification(
    'ca000000-0000-4000-8000-000000000002',
    'ca000000-0000-4000-8000-000000000001', 'customer', 'revoke owner authority for isolated proof');
  v_customer := tongs.resolve_account_authority_classification('ca000000-0000-4000-8000-000000000002');
  if v_customer->>'account_class' <> 'customer' or (v_customer->>'revision')::integer <> 2
     or not (v_customer->>'explicit')::boolean then
    raise exception 'owner revocation did not append explicit customer revision';
  end if;
  if (select count(*) from tongs.account_authority_classification_events
      where user_id = 'ca000000-0000-4000-8000-000000000002') <> 2 then
    raise exception 'owner to customer history was not append-only';
  end if;
end
$$;

do $$ begin
  begin
    perform tongs.read_account_authority_classification(
      'ca000000-0000-4000-8000-000000000002',
      'ca000000-0000-4000-8000-000000000003');
    raise exception 'non-operator used guarded account authority read';
  exception when insufficient_privilege then null; end;
  begin
    update tongs.account_authority_classification_events
    set reason = 'forbidden history rewrite'
    where user_id = 'ca000000-0000-4000-8000-000000000002' and revision = 1;
    raise exception 'account authority history was mutable';
  exception when object_not_in_prerequisite_state then null; end;
  begin
    delete from tongs.account_authority_classification_events
    where user_id = 'ca000000-0000-4000-8000-000000000002' and revision = 1;
    raise exception 'account authority history was deletable';
  exception when object_not_in_prerequisite_state then null; end;
end $$;

do $$
declare
  v_workspace_only jsonb;
  v_platform_only jsonb;
  v_credit_only jsonb;
begin
  v_workspace_only := tongs.resolve_account_authority_classification('ca000000-0000-4000-8000-000000000004');
  v_platform_only := tongs.resolve_account_authority_classification('ca000000-0000-4000-8000-000000000005');
  v_credit_only := tongs.resolve_account_authority_classification('ca000000-0000-4000-8000-000000000006');
  if v_workspace_only->>'account_class' <> 'customer'
     or v_platform_only->>'account_class' <> 'customer'
     or v_credit_only->>'account_class' <> 'customer' then
    raise exception 'workspace, operator, or credit state implied owner authority';
  end if;
  if pg_get_functiondef('tongs.configure_account_authority_classification(uuid,uuid,text,text)'::regprocedure)
       ~* '(public[.]profiles|account_balances|ai_credits|workspace_members|subscriptions)'
     or pg_get_functiondef('tongs.resolve_account_authority_classification(uuid)'::regprocedure)
       ~* '(public[.]profiles|account_balances|ai_credits|workspace_members|subscriptions)' then
    raise exception 'account authority depends on profile, customer finance, or workspace role';
  end if;
end
$$;

rollback;
