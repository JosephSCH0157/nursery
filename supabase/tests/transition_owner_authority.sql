begin;

insert into auth.users(id, email) values
  ('cb000000-0000-4000-8000-000000000001', 'dual-owner@example.test'),
  ('cb000000-0000-4000-8000-000000000002', 'canonical-only@example.test'),
  ('cb000000-0000-4000-8000-000000000003', 'legacy-only@example.test'),
  ('cb000000-0000-4000-8000-000000000004', 'ordinary-customer@example.test'),
  ('cb000000-0000-4000-8000-000000000005', 'authority-operator@example.test');

insert into tongs.account_authority_classifications(
  user_id, account_class, revision, reason, configured_by
) values
  ('cb000000-0000-4000-8000-000000000001', 'owner', 3, 'dual-read agreement proof', 'cb000000-0000-4000-8000-000000000005'),
  ('cb000000-0000-4000-8000-000000000002', 'owner', 4, 'canonical-only mismatch proof', 'cb000000-0000-4000-8000-000000000005'),
  ('cb000000-0000-4000-8000-000000000004', 'customer', 2, 'explicit customer proof', 'cb000000-0000-4000-8000-000000000005');

insert into tongs.owner_testing_principals(
  user_id, status, revision, reason, configured_by
) values
  ('cb000000-0000-4000-8000-000000000001', 'enabled', 7, 'dual-read agreement proof', 'cb000000-0000-4000-8000-000000000005'),
  ('cb000000-0000-4000-8000-000000000003', 'enabled', 8, 'legacy-only mismatch proof', 'cb000000-0000-4000-8000-000000000005'),
  ('cb000000-0000-4000-8000-000000000004', 'disabled', 5, 'explicit non-owner proof', 'cb000000-0000-4000-8000-000000000005');

select set_config('request.jwt.claim.role', 'service_role', true);

do $$
declare
  v_agree jsonb;
  v_canonical_only jsonb;
  v_legacy_only jsonb;
  v_customer jsonb;
begin
  v_agree := tongs.resolve_transition_owner_authority('cb000000-0000-4000-8000-000000000001');
  v_canonical_only := tongs.resolve_transition_owner_authority('cb000000-0000-4000-8000-000000000002');
  v_legacy_only := tongs.resolve_transition_owner_authority('cb000000-0000-4000-8000-000000000003');
  v_customer := tongs.resolve_transition_owner_authority('cb000000-0000-4000-8000-000000000004');

  if not (v_agree->>'eligible')::boolean
     or v_agree->>'state' <> 'eligible'
     or (v_agree->>'account_authority_revision')::integer <> 3
     or (v_agree->>'legacy_principal_revision')::integer <> 7
     or v_agree->>'authority_mode' <> 'canonical_legacy_dual_read'
     or not (v_agree->>'same_user')::boolean then
    raise exception 'dual-read owner agreement did not resolve with both revisions';
  end if;
  if (v_canonical_only->>'eligible')::boolean
     or v_canonical_only->>'state' <> 'authority_mismatch'
     or (v_legacy_only->>'eligible')::boolean
     or v_legacy_only->>'state' <> 'authority_mismatch' then
    raise exception 'one-sided owner authority did not fail closed as a mismatch';
  end if;
  if (v_customer->>'eligible')::boolean
     or v_customer->>'state' <> 'not_owner'
     or not (v_customer->>'consistent')::boolean then
    raise exception 'ordinary customer did not remain a consistent non-owner';
  end if;
  if not tongs._transition_owner_authority_agrees('cb000000-0000-4000-8000-000000000001')
     or tongs._transition_owner_authority_agrees('cb000000-0000-4000-8000-000000000002')
     or tongs._transition_owner_authority_agrees('cb000000-0000-4000-8000-000000000003') then
    raise exception 'private agreement predicate does not require both authorities';
  end if;
end
$$;

do $$
declare
  v_reader regprocedure;
begin
  if has_function_privilege('authenticated', 'tongs.resolve_transition_owner_authority(uuid)', 'execute')
     or has_function_privilege('anon', 'tongs.resolve_transition_owner_authority(uuid)', 'execute')
     or has_function_privilege('authenticated', 'tongs._transition_owner_authority_agrees(uuid)', 'execute')
     or has_function_privilege('anon', 'tongs._transition_owner_authority_agrees(uuid)', 'execute') then
    raise exception 'browser role can execute private transition authority functions';
  end if;
  if not has_function_privilege('service_role', 'tongs.resolve_transition_owner_authority(uuid)', 'execute')
     or has_function_privilege('service_role', 'tongs._transition_owner_authority_agrees(uuid)', 'execute') then
    raise exception 'transition authority service grants are incorrect';
  end if;
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'tongs'
      and p.proname in ('resolve_transition_owner_authority', '_transition_owner_authority_agrees')
      and not ('search_path=pg_catalog' = any(coalesce(p.proconfig, '{}'::text[])))
  ) then
    raise exception 'transition authority function lacks pinned search_path';
  end if;

  foreach v_reader in array array[
    'tongs._quote_owner_budget_allows(uuid,uuid)'::regprocedure,
    'tongs._resolve_spending_authority(uuid,uuid,text)'::regprocedure,
    'tongs._validate_quote_authority_before_provider(uuid,text)'::regprocedure,
    'tongs.activate_owner_hearth_compatibility_package(uuid,uuid,uuid,uuid,uuid,uuid,text)'::regprocedure,
    'tongs.activate_owner_hearth_compatibility_retry(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text)'::regprocedure,
    'tongs.create_owner_testing_budget_draft(uuid,uuid,uuid,text,uuid,text,text,text,text,timestamptz,timestamptz,text)'::regprocedure,
    'tongs.read_my_ai_funding_options(uuid)'::regprocedure,
    'tongs.read_openai_text_model_choices(text)'::regprocedure,
    'tongs.read_owner_hearth_execution_requirement(uuid,uuid,text)'::regprocedure,
    'tongs.read_owner_hearth_research_execution_requirement(uuid,uuid,text)'::regprocedure,
    'tongs.set_my_ai_funding_preference(uuid,text,uuid)'::regprocedure
  ] loop
    if pg_get_functiondef(v_reader) !~ '(_transition_owner_authority_agrees|resolve_transition_owner_authority)' then
      raise exception 'SQL owner authority reader % lacks the transition contract', v_reader;
    end if;
  end loop;

  if to_regprocedure('tongs.configure_owner_testing_principal(uuid,uuid,text,text)') is null then
    raise exception 'legacy owner principal mutation contract was removed early';
  end if;
end
$$;

select set_config('request.jwt.claim.role', 'authenticated', true);
do $$ begin
  begin
    perform tongs.resolve_transition_owner_authority('cb000000-0000-4000-8000-000000000001');
    raise exception 'authenticated caller resolved raw transition authority';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.role', 'anon', true);
do $$ begin
  begin
    perform tongs.resolve_transition_owner_authority('cb000000-0000-4000-8000-000000000001');
    raise exception 'anonymous caller resolved raw transition authority';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.role', 'service_role', true);
do $$ begin
  if exists(select 1 from tongs.verify_owner_cost_reconstruction()) then
    raise exception 'owner-cost reconstruction changed during transition authority proof';
  end if;
  if exists(select 1 from tongs.verify_accounting_reconstruction()) then
    raise exception 'canonical accounting reconstruction changed during transition authority proof';
  end if;
end $$;

rollback;
