-- Dual-read transition authority for owner-account execution. Canonical account
-- authority and the legacy owner principal must agree until Slice C retires the
-- legacy authority.
begin;

create or replace function tongs._transition_owner_authority_agrees(
  p_user_id uuid
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select p_user_id is not null
    and exists(
      select 1
      from tongs.account_authority_classifications c
      where c.user_id = p_user_id
        and c.account_class = 'owner'
    )
    and exists(
      select 1
      from tongs.owner_testing_principals p
      where p.user_id = p_user_id
        and p.status = 'enabled'
    );
$$;

create or replace function tongs.resolve_transition_owner_authority(
  p_user_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_canonical tongs.account_authority_classifications%rowtype;
  v_legacy tongs.owner_testing_principals%rowtype;
  v_canonical_owner boolean := false;
  v_legacy_enabled boolean := false;
  v_state text;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'account user id required' using errcode = '22023';
  end if;

  select * into v_canonical
  from tongs.account_authority_classifications
  where user_id = p_user_id;
  v_canonical_owner := found and v_canonical.account_class = 'owner';

  select * into v_legacy
  from tongs.owner_testing_principals
  where user_id = p_user_id;
  v_legacy_enabled := found and v_legacy.status = 'enabled';

  v_state := case
    when v_canonical_owner and v_legacy_enabled then 'eligible'
    when v_canonical_owner <> v_legacy_enabled then 'authority_mismatch'
    else 'not_owner'
  end;

  return jsonb_build_object(
    'user_id', p_user_id,
    'canonical_user_id', v_canonical.user_id,
    'account_class', coalesce(v_canonical.account_class, 'customer'),
    'account_authority_revision', v_canonical.revision,
    'account_authority_explicit', v_canonical.user_id is not null,
    'legacy_user_id', v_legacy.user_id,
    'legacy_principal_status', v_legacy.status,
    'legacy_principal_revision', v_legacy.revision,
    'same_user', (v_canonical.user_id is null or v_canonical.user_id = p_user_id)
      and (v_legacy.user_id is null or v_legacy.user_id = p_user_id),
    'consistent', v_canonical_owner = v_legacy_enabled,
    'eligible', v_canonical_owner and v_legacy_enabled,
    'state', v_state,
    'authority_mode', 'canonical_legacy_dual_read'
  );
end
$$;

revoke all on function tongs._transition_owner_authority_agrees(uuid)
  from public, anon, authenticated, service_role;
revoke all on function tongs.resolve_transition_owner_authority(uuid)
  from public, anon, authenticated, service_role;
grant execute on function tongs.resolve_transition_owner_authority(uuid)
  to service_role;

-- Preserve each reader's existing product behavior while requiring agreement
-- at every legacy owner-authority decision point.
do $$
declare
  v_definition text;
  v_changed text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef('tongs._quote_owner_budget_allows(uuid,uuid)'::regprocedure)
    into v_definition;
  v_definition := replace(v_definition, chr(13), '');
  v_old := 'where binding.quote_id=p_quote_id and binding.payer_kind=''owner_testing''';
  v_new := 'where binding.quote_id=p_quote_id and binding.payer_kind=''owner_testing''
      and tongs._transition_owner_authority_agrees(binding.acting_user_id)';
  v_changed := replace(v_definition, v_old, v_new);
  if v_changed = v_definition then raise exception '_quote_owner_budget_allows transition patch did not match'; end if;
  execute v_changed;

  select pg_get_functiondef('tongs._resolve_spending_authority(uuid,uuid,text)'::regprocedure)
    into v_definition;
  v_definition := replace(v_definition, chr(13), '');
  v_old := '  v_principal tongs.owner_testing_principals%rowtype;';
  v_new := '  v_owner_authority jsonb;';
  v_changed := replace(v_definition, v_old, v_new);
  if v_changed = v_definition then raise exception '_resolve_spending_authority declaration patch did not match'; end if;
  v_definition := v_changed;
  v_old := '    select * into v_principal from tongs.owner_testing_principals where user_id=p_user_id and status=''enabled'';
    if not found then raise exception ''owner-testing authority is no longer available'' using errcode=''42501''; end if;
    return jsonb_build_object(''payer_kind'',''owner_testing'',''payer_user_id'',p_user_id,
      ''preference_revision_id'',v_pref.id,''owner_principal_revision'',v_principal.revision);';
  v_new := '    v_owner_authority := tongs.resolve_transition_owner_authority(p_user_id);
    if not coalesce((v_owner_authority->>''eligible'')::boolean,false) then
      raise exception ''owner-testing authority is no longer available'' using errcode=''42501''; end if;
    return jsonb_build_object(''payer_kind'',''owner_testing'',''payer_user_id'',p_user_id,
      ''preference_revision_id'',v_pref.id,
      ''account_authority_revision'',(v_owner_authority->>''account_authority_revision'')::integer,
      ''owner_principal_revision'',(v_owner_authority->>''legacy_principal_revision'')::integer,
      ''owner_authority_mode'',''canonical_legacy_dual_read'');';
  v_changed := replace(v_changed, v_old, v_new);
  if v_changed = v_definition then raise exception '_resolve_spending_authority transition patch did not match'; end if;
  execute v_changed;

  select pg_get_functiondef('tongs._validate_quote_authority_before_provider(uuid,text)'::regprocedure)
    into v_definition;
  v_definition := replace(v_definition, chr(13), '');
  v_old := '    return exists(select 1 from tongs.owner_testing_principals p
      where p.user_id=v_binding.acting_user_id and p.status=''enabled'' and p.revision=v_binding.owner_principal_revision);';
  v_new := '    return tongs._transition_owner_authority_agrees(v_binding.acting_user_id)
      and exists(select 1 from tongs.owner_testing_principals p
        where p.user_id=v_binding.acting_user_id and p.status=''enabled'' and p.revision=v_binding.owner_principal_revision);';
  v_changed := replace(v_definition, v_old, v_new);
  if v_changed = v_definition then raise exception '_validate_quote_authority_before_provider transition patch did not match'; end if;
  execute v_changed;

  select pg_get_functiondef('tongs.activate_owner_hearth_compatibility_package(uuid,uuid,uuid,uuid,uuid,uuid,text)'::regprocedure)
    into v_definition;
  v_definition := replace(v_definition, chr(13), '');
  v_old := ' if not exists(select 1 from tongs.owner_testing_principals where user_id=p_owner_user_id and status=''enabled'')
    or not exists(select 1 from tongs.workspace_members where user_id=p_owner_user_id and workspace_id=p_workspace_id) then';
  v_new := ' if not tongs._transition_owner_authority_agrees(p_owner_user_id)
    or not exists(select 1 from tongs.workspace_members where user_id=p_owner_user_id and workspace_id=p_workspace_id) then';
  v_changed := replace(v_definition, v_old, v_new);
  if v_changed = v_definition then raise exception 'activate_owner_hearth_compatibility_package transition patch did not match'; end if;
  execute v_changed;

  select pg_get_functiondef('tongs.activate_owner_hearth_compatibility_retry(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text)'::regprocedure)
    into v_definition;
  v_definition := replace(v_definition, chr(13), '');
  v_changed := replace(v_definition, v_old, v_new);
  if v_changed = v_definition then raise exception 'activate_owner_hearth_compatibility_retry transition patch did not match'; end if;
  execute v_changed;

  select pg_get_functiondef('tongs.create_owner_testing_budget_draft(uuid,uuid,uuid,text,uuid,text,text,text,text,timestamptz,timestamptz,text)'::regprocedure)
    into v_definition;
  v_definition := replace(v_definition, chr(13), '');
  v_old := '  if not exists(select 1 from tongs.owner_testing_principals p where p.user_id=p_owner_testing_user_id and p.status=''enabled'') then';
  v_new := '  if not tongs._transition_owner_authority_agrees(p_owner_testing_user_id) then';
  v_changed := replace(v_definition, v_old, v_new);
  if v_changed = v_definition then raise exception 'create_owner_testing_budget_draft transition patch did not match'; end if;
  execute v_changed;

  select pg_get_functiondef('tongs.read_my_ai_funding_options(uuid)'::regprocedure)
    into v_definition;
  v_definition := replace(v_definition, chr(13), '');
  v_old := '  v_owner := exists(select 1 from tongs.owner_testing_principals p where p.user_id=v_user and p.status=''enabled'');';
  v_new := '  v_owner := tongs._transition_owner_authority_agrees(v_user);';
  v_changed := replace(v_definition, v_old, v_new);
  if v_changed = v_definition then raise exception 'read_my_ai_funding_options transition patch did not match'; end if;
  execute v_changed;

  select pg_get_functiondef('tongs.read_openai_text_model_choices(text)'::regprocedure)
    into v_definition;
  v_definition := replace(v_definition, chr(13), '');
  v_old := '    and exists(select 1 from tongs.owner_testing_principals otp where otp.user_id=uid and otp.status=''enabled'')';
  v_new := '    and tongs._transition_owner_authority_agrees(uid)';
  v_changed := replace(v_definition, v_old, v_new);
  if v_changed = v_definition then raise exception 'read_openai_text_model_choices transition patch did not match'; end if;
  execute v_changed;

  select pg_get_functiondef('tongs.read_owner_hearth_execution_requirement(uuid,uuid,text)'::regprocedure)
    into v_definition;
  v_definition := replace(v_definition, chr(13), '');
  v_old := 'declare principal tongs.owner_testing_principals%rowtype; authz tongs.owner_hearth_authorizations%rowtype; ev tongs.owner_hearth_authorization_events%rowtype;';
  v_new := 'declare authz tongs.owner_hearth_authorizations%rowtype; ev tongs.owner_hearth_authorization_events%rowtype;';
  v_changed := replace(v_definition, v_old, v_new);
  if v_changed = v_definition then raise exception 'read_owner_hearth_execution_requirement declaration patch did not match'; end if;
  v_definition := v_changed;
  v_old := ' select * into principal from tongs.owner_testing_principals where user_id=p_owner_user_id and status=''enabled'';
 if not found or not exists(select 1 from tongs.workspace_members where workspace_id=p_workspace_id and user_id=p_owner_user_id) then';
  v_new := ' if not tongs._transition_owner_authority_agrees(p_owner_user_id)
    or not exists(select 1 from tongs.workspace_members where workspace_id=p_workspace_id and user_id=p_owner_user_id) then';
  v_changed := replace(v_changed, v_old, v_new);
  if v_changed = v_definition then raise exception 'read_owner_hearth_execution_requirement transition patch did not match'; end if;
  execute v_changed;

  select pg_get_functiondef('tongs.read_owner_hearth_research_execution_requirement(uuid,uuid,text)'::regprocedure)
    into v_definition;
  v_definition := replace(v_definition, chr(13), '');
  v_old := ' if not exists(select 1 from tongs.owner_testing_principals p where p.user_id=p_owner_user_id and p.status=''enabled'')
   or not exists(select 1 from tongs.workspace_members m where m.workspace_id=p_workspace_id and m.user_id=p_owner_user_id) then';
  v_new := ' if not tongs._transition_owner_authority_agrees(p_owner_user_id)
   or not exists(select 1 from tongs.workspace_members m where m.workspace_id=p_workspace_id and m.user_id=p_owner_user_id) then';
  v_changed := replace(v_definition, v_old, v_new);
  if v_changed = v_definition then raise exception 'read_owner_hearth_research_execution_requirement transition patch did not match'; end if;
  execute v_changed;

  select pg_get_functiondef('tongs.set_my_ai_funding_preference(uuid,text,uuid)'::regprocedure)
    into v_definition;
  v_definition := replace(v_definition, chr(13), '');
  v_old := '  if p_payer_kind=''owner_testing'' and not exists(
    select 1 from tongs.owner_testing_principals p where p.user_id=v_user and p.status=''enabled''
  ) then';
  v_new := '  if p_payer_kind=''owner_testing'' and not tongs._transition_owner_authority_agrees(v_user) then';
  v_changed := replace(v_definition, v_old, v_new);
  if v_changed = v_definition then raise exception 'set_my_ai_funding_preference transition patch did not match'; end if;
  execute v_changed;
end
$$;

comment on function tongs._transition_owner_authority_agrees(uuid) is
  'Private SQL predicate requiring current canonical owner classification and enabled legacy owner principal for the same user.';
comment on function tongs.resolve_transition_owner_authority(uuid) is
  'Service-only dual-read transition resolver. Raw authority evidence is never browser-readable.';

commit;
