-- Shared owner-only paid-execution authority and inert aggregate staging.
-- This migration creates no scope, assignment, rollout, quote, reservation,
-- exposure hold, or provider authority.
begin;

alter table tongs.customer_paid_execution_scope_authorizations
  drop constraint customer_paid_execution_scope_authoriz_authorization_kind_check,
  drop constraint customer_paid_execution_scope_aut_maximum_operation_count_check,
  drop constraint customer_paid_execution_scope_auth_rolling_window_seconds_check,
  drop constraint customer_paid_execution_scope_authorizations_check;

alter table tongs.customer_paid_execution_scope_authorizations
  add constraint customer_paid_execution_scope_authorizations_authorization_kind_check
    check (authorization_kind in ('certification', 'normal_customer', 'owner_only')),
  add constraint customer_paid_execution_scope_aut_maximum_operation_count_check
    check (
      (authorization_kind in ('certification', 'owner_only') and maximum_operation_count > 0)
      or (authorization_kind = 'normal_customer' and maximum_operation_count is null)
    ),
  add constraint customer_paid_execution_scope_auth_rolling_window_seconds_check
    check (
      (authorization_kind in ('certification', 'owner_only') and rolling_window_seconds > 0)
      or (authorization_kind = 'normal_customer' and rolling_window_seconds is null)
    ),
  add constraint customer_paid_execution_scope_authorizations_check
    check (
      (authorization_kind in ('certification', 'owner_only') and valid_until > valid_from)
      or (authorization_kind = 'normal_customer' and valid_until is null)
    );

create or replace function tongs.create_owner_only_openai_text_execution_scope_authorization(
  p_authorization_id uuid,
  p_actor_id uuid,
  p_owner_user_id uuid,
  p_workspace_id uuid,
  p_financial_environment text,
  p_route_code text,
  p_model_or_sku text,
  p_valid_from timestamptz,
  p_valid_until timestamptz,
  p_reason text
) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_existing tongs.customer_paid_execution_scope_authorizations%rowtype;
  v_model record;
  v_cost tongs.openai_text_cost_policy_revisions%rowtype;
  v_pricing tongs.private_pricing_revisions%rowtype;
  v_loss tongs.openai_text_failure_loss_policy_revisions%rowtype;
  v_owner_count bigint;
  v_loss_environment text;
begin
  perform tongs._require_pricing_service_role();
  if p_authorization_id is null or p_actor_id is null
     or not tongs.is_platform_operator(p_actor_id)
     or p_owner_user_id is null or p_workspace_id is null
     or p_financial_environment not in ('test', 'live')
     or nullif(btrim(coalesce(p_route_code, '')), '') is null
     or nullif(btrim(coalesce(p_model_or_sku, '')), '') is null
     or p_valid_from is null or p_valid_until is null or p_valid_until <= p_valid_from
     or nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'invalid owner-only paid execution scope authorization'
      using errcode = '22023';
  end if;

  select count(*) into v_owner_count
  from tongs.account_authority_classifications
  where account_class = 'owner';
  if v_owner_count <> 1
     or not exists (
       select 1 from tongs.account_authority_classifications
       where user_id = p_owner_user_id and account_class = 'owner'
     )
     or not tongs._transition_owner_authority_agrees(p_owner_user_id) then
    raise exception 'canonical owner authority is absent, ambiguous, or disagrees'
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from tongs.workspace_members
    where user_id = p_owner_user_id and workspace_id = p_workspace_id
  ) then
    raise exception 'canonical owner workspace membership required'
      using errcode = '42501';
  end if;

  select * into v_existing
  from tongs.customer_paid_execution_scope_authorizations
  where id = p_authorization_id;
  if found then
    if v_existing.authorization_kind <> 'owner_only'
       or v_existing.user_id <> p_owner_user_id
       or v_existing.workspace_id <> p_workspace_id
       or v_existing.financial_environment <> p_financial_environment
       or v_existing.route_code <> btrim(p_route_code)
       or v_existing.provider <> 'openai'
       or v_existing.model_or_sku <> btrim(p_model_or_sku)
       or v_existing.valid_from <> p_valid_from
       or v_existing.valid_until <> p_valid_until then
      raise exception 'owner-only authorization replay conflict'
        using errcode = '23505';
    end if;
    return to_jsonb(v_existing) || jsonb_build_object('replay', true);
  end if;

  select * into v_model
  from tongs._eligible_ai_models_for_operation(btrim(p_route_code)) eligible
  where eligible.runtime_model_id = btrim(p_model_or_sku);
  if not found then
    raise exception 'exact operation/model financial authority is not eligible'
      using errcode = '42501';
  end if;

  select * into v_cost
  from tongs.openai_text_cost_policy_revisions
  where id = v_model.cost_policy_revision_id;
  select pricing.* into v_pricing
  from tongs._published_pricing_revision(
    'openai', lower('openai-text:' || btrim(p_route_code) || ':' || v_model.runtime_model_id || ':' || v_model.cost_policy_revision_id::text)
  ) pricing;
  if v_cost.id is null or v_pricing.id is null
     or v_cost.cost_coverage <> 'complete'
     or v_pricing.full_cost_ceiling_micros <> v_cost.full_cost_ceiling_micros
     or v_pricing.customer_credit_units <> v_model.customer_credit_units then
    raise exception 'exact published operation/model financial authority required'
      using errcode = '42501';
  end if;

  v_loss_environment := case p_financial_environment when 'test' then 'test' else 'production' end;
  select * into v_loss
  from tongs.openai_text_failure_loss_policy_revisions
  where route_code = btrim(p_route_code)
    and environment = v_loss_environment
    and lifecycle_state = 'active'
  order by revision desc limit 1;
  if not found
     or v_loss.per_operation_limit_micros < v_cost.full_cost_ceiling_micros
     or v_loss.aggregate_limit_micros < v_loss.per_operation_limit_micros then
    raise exception 'active bounded failure-loss authority required for exact environment'
      using errcode = '42501';
  end if;

  insert into tongs.customer_paid_execution_scope_authorizations(
    id, user_id, workspace_id, financial_environment, route_code, provider,
    model_or_sku, pricing_revision_id, cost_policy_revision_id,
    maximum_operation_count, maximum_customer_charge_micros,
    maximum_wholesale_exposure_micros, maximum_concurrency,
    rolling_window_seconds, valid_from, valid_until, status, reason,
    created_by, authorization_kind
  ) values (
    p_authorization_id, p_owner_user_id, p_workspace_id, p_financial_environment,
    btrim(p_route_code), 'openai', btrim(p_model_or_sku),
    v_pricing.id, v_model.cost_policy_revision_id, 1,
    v_pricing.customer_price_ceiling_micros, v_cost.full_cost_ceiling_micros,
    least(v_loss.maximum_concurrency, 1), v_loss.rolling_window_seconds,
    p_valid_from, p_valid_until, 'active', btrim(p_reason), p_actor_id, 'owner_only'
  ) returning * into v_existing;

  return to_jsonb(v_existing) || jsonb_build_object('replay', false);
end
$$;

create or replace function tongs._active_owner_only_paid_execution_scope(
  p_owner_user_id uuid,
  p_workspace_id uuid,
  p_financial_environment text,
  p_route_code text,
  p_model_or_sku text,
  p_pricing_revision_id uuid,
  p_cost_policy_revision_id uuid
) returns tongs.customer_paid_execution_scope_authorizations
language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  v_scope tongs.customer_paid_execution_scope_authorizations%rowtype;
  v_owner_count bigint;
begin
  perform tongs._require_pricing_service_role();
  select count(*) into v_owner_count
  from tongs.account_authority_classifications
  where account_class = 'owner';
  if v_owner_count <> 1 or not tongs._transition_owner_authority_agrees(p_owner_user_id) then
    return null;
  end if;
  select * into v_scope
  from tongs.customer_paid_execution_scope_authorizations
  where authorization_kind = 'owner_only'
    and user_id = p_owner_user_id
    and workspace_id = p_workspace_id
    and financial_environment = p_financial_environment
    and route_code = p_route_code
    and provider = 'openai'
    and model_or_sku = p_model_or_sku
    and pricing_revision_id = p_pricing_revision_id
    and cost_policy_revision_id = p_cost_policy_revision_id
    and status = 'active'
    and valid_from <= now() and valid_until > now()
  order by created_at desc limit 1;
  return v_scope;
end
$$;

-- Owner scopes are private execution authority. Generic customer-funded
-- reservation selection may continue to use only its two historical kinds.
do $$
declare
  v_definition text;
  v_changed text;
  v_old text := '    and scope_auth.cost_policy_revision_id=openai_binding.cost_policy_revision_id
    and scope_auth.status=''active'' and scope_auth.valid_from<=now()';
  v_new text := '    and scope_auth.cost_policy_revision_id=openai_binding.cost_policy_revision_id
    and scope_auth.authorization_kind in(''certification'',''normal_customer'')
    and scope_auth.status=''active'' and scope_auth.valid_from<=now()';
begin
  select replace(pg_get_functiondef('tongs._stamp_and_authorize_funding_reservation()'::regprocedure), chr(13), '')
    into v_definition;
  v_changed := replace(v_definition, v_old, v_new);
  if v_changed = v_definition then
    raise exception 'customer funding owner-only exclusion patch did not match';
  end if;
  execute v_changed;
end
$$;

-- Assignment validity is configuration validity. Rollout is checked at every
-- new runtime admission, not when an otherwise-valid assignment is staged.
create or replace function tongs._validate_paid_execution_aggregate_assignment()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  return new;
end
$$;

create or replace function tongs.acquire_openai_text_aggregate_admission(
  p_reservation_id uuid,p_caller_class text,p_provider_mode text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare b tongs.openai_text_funding_bindings%rowtype; r tongs.funding_reservations%rowtype;
 q tongs.customer_spending_quotes%rowtype; qb tongs.openai_text_customer_quote_bindings%rowtype;
 c tongs.openai_text_cost_policy_revisions%rowtype; a tongs.paid_execution_aggregate_assignments%rowtype;
 existing tongs.paid_operation_aggregate_bindings%rowtype; capability text; funding_class text;
 environment text; hold_id uuid; admitted jsonb; workspace uuid; supplier bigint;
 rollout tongs.openai_text_rollout_revisions%rowtype;
begin
 perform tongs._require_pricing_service_role();
 if p_caller_class not in ('interactive','background','retry','recovery') or p_provider_mode not in ('real','simulated','byo') then raise exception 'invalid aggregate caller context' using errcode='22023'; end if;
 select * into existing from tongs.paid_operation_aggregate_bindings where reservation_id=p_reservation_id;
 if found then return jsonb_build_object('enforcement_enabled',true,'authorized',true,'replay',true,'hold_id',existing.hold_id,'reason','existing_authoritative_admission'); end if;
 select * into b from tongs.openai_text_funding_bindings where reservation_id=p_reservation_id;
 select * into r from tongs.funding_reservations where id=p_reservation_id;
 select * into q from tongs.customer_spending_quotes where id=r.quote_id;
 select * into rollout from tongs._openai_rollout_for_funding(b.route_code,b.credential_funding);
 if rollout.mode<>'enforce' then
  return jsonb_build_object('enforcement_enabled',false,'authorized',false,'replay',false,'reason','rollout_halt_new');
 end if;
 if exists (
   select 1 from tongs.customer_paid_execution_scope_authorizations scope_auth
   where scope_auth.id = r.rollout_authorization_id
     and scope_auth.authorization_kind = 'normal_customer'
     and scope_auth.status = 'active'
 ) then
   return jsonb_build_object('enforcement_enabled',false,'authorized',true,'replay',false,'reason','normal_customer_credit_bounded');
 end if;
 select * into qb from tongs.openai_text_customer_quote_bindings where quote_id=q.id;
 select * into c from tongs.openai_text_cost_policy_revisions where id=b.cost_policy_revision_id;
 if b.operation_id is null or r.id is null or q.id is null or qb.quote_id is null or c.id is null or q.workspace_id is null
    or not exists(select 1 from tongs.customer_spending_quote_acceptances accepted where accepted.quote_id=q.id and accepted.user_id=r.user_id)
    or q.operation_id<>r.operation_id or qb.canonical_operation_id<>b.operation_id
    or qb.user_id<>r.user_id or qb.workspace_id<>q.workspace_id or qb.request_fingerprint<>q.request_fingerprint
    or qb.runtime_model<>b.model or qb.cost_policy_revision_id<>b.cost_policy_revision_id
    or qb.pricing_revision_id<>q.pricing_revision_id or q.request_fingerprint is null
    or c.cost_coverage<>'complete' or c.full_cost_ceiling_micros<>r.reserved_wholesale_spend_micros then
  raise exception 'exact accepted funding and complete cost policy required' using errcode='42501';
 end if;
 workspace:=q.workspace_id; funding_class:=tongs._aggregate_funding_class(r);
 environment:=case when r.funding_environment='test' then 'test' else 'production' end;
 select * into a from tongs._active_paid_execution_aggregate_assignment(r.user_id,workspace,environment);
 if not found then return jsonb_build_object('enforcement_enabled',false,'authorized',true,'replay',false,'reason','aggregate_assignment_inactive'); end if;
 capability:=case b.route_code
  when 'hearth.chat_completion' then 'openai.text.hearth_chat'
  when 'hearth.research_synthesis' then 'openai.text.hearth_research'
  when 'visual.unified_plan' then 'openai.text.visual_unified_plan'
  when 'visual.narrative_interpretation' then 'openai.text.visual_narrative'
  when 'motion.broll_interpretation' then 'openai.text.motion_broll'
  when 'hammer.transcript_cleanup' then 'openai.text.hammer_cleanup'
  when 'shorts.discovery' then 'openai.text.shorts_discovery'
  when 'quench.metadata' then 'openai.text.quench_metadata' else null end;
 if capability is null then raise exception 'unmapped paid OpenAI route' using errcode='P0001'; end if;
 if b.credential_funding='byo_customer' and p_provider_mode<>'byo' then raise exception 'BYO provider mode required' using errcode='42501'; end if;
 if b.credential_funding='forge' and p_provider_mode='byo' then raise exception 'Forge provider mode required' using errcode='42501'; end if;
 if funding_class='test_customer' and b.credential_funding='byo_customer' and c.supporting_cost_ceiling_micros>0 then
  return jsonb_build_object('enforcement_enabled',true,'authorized',false,'reason','test_supporting_real_provider_forbidden'); end if;
 supplier:=case when b.credential_funding='forge' then c.direct_provider_ceiling_micros else 0 end;
 hold_id:=extensions.uuid_generate_v5(p_reservation_id,'aggregate-exposure');
 admitted:=tongs.reserve_restricted_beta_exposure(hold_id,a.policy_revision_id,capability,b.operation_id,r.user_id,workspace,q.request_fingerprint,
  b.model,funding_class,p_reservation_id::text,p_provider_mode,p_caller_class,r.reserved_customer_charge_micros,supplier,
  c.supporting_cost_ceiling_micros,0,0,0,180,p_reservation_id::text||':aggregate-reserved');
 if coalesce((admitted->>'authorized')::boolean,false) then
  insert into tongs.paid_operation_aggregate_bindings(
   reservation_id,hold_id,policy_revision_id,capability_code,provider,operation_id,user_id,workspace_id,
   request_fingerprint,model_or_sku,funding_source_type,credential_funding,provider_mode,pricing_revision_id,
   cost_policy_revision_id,customer_funding_ceiling_micros,supplier_exposure_ceiling_micros,supporting_exposure_ceiling_micros)
  values(r.id,hold_id,a.policy_revision_id,capability,'openai',b.operation_id,r.user_id,workspace,q.request_fingerprint,
   b.model,r.funding_source_type,b.credential_funding,p_provider_mode,q.pricing_revision_id,c.id,
   r.reserved_customer_charge_micros,supplier,c.supporting_cost_ceiling_micros);
 end if;
 return jsonb_build_object('enforcement_enabled',true)||admitted;
end
$$;

create or replace function tongs.acquire_runway_aggregate_admission(p_operation_id text,p_operation_fingerprint text,p_user_id uuid,p_workspace_id uuid,p_caller_class text,p_provider_mode text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare b tongs.runway_funding_bindings%rowtype; r tongs.funding_reservations%rowtype; a tongs.paid_execution_aggregate_assignments%rowtype;
 existing tongs.paid_operation_aggregate_bindings%rowtype; funding_class text; environment text; hold_id uuid; admitted jsonb;
 rollout tongs.runway_execution_rollout_revisions%rowtype;
begin
 perform tongs._require_pricing_service_role();
 select * into b from tongs.runway_funding_bindings where operation_id=btrim(p_operation_id);
 if not found or b.operation_fingerprint<>p_operation_fingerprint or b.user_id<>p_user_id or b.workspace_id<>p_workspace_id then raise exception 'exact Runway funding binding required' using errcode='42501'; end if;
 select * into existing from tongs.paid_operation_aggregate_bindings where reservation_id=b.reservation_id;
 if found then return jsonb_build_object('enforcement_enabled',true,'authorized',true,'replay',true,'hold_id',existing.hold_id,'reason','existing_authoritative_admission'); end if;
 select * into r from tongs.funding_reservations where id=b.reservation_id;
 select * into rollout from tongs._current_runway_execution_rollout();
 if rollout.mode<>'enforce' then return jsonb_build_object('enforcement_enabled',false,'authorized',false,'replay',false,'reason','rollout_halt_new'); end if;
 funding_class:=tongs._aggregate_funding_class(r); environment:=case when funding_class='test_customer' then 'test' else 'production' end;
 select * into a from tongs._active_paid_execution_aggregate_assignment(p_user_id,p_workspace_id,environment);
 if not found then return jsonb_build_object('enforcement_enabled',false,'authorized',true,'replay',false,'reason','aggregate_assignment_inactive'); end if;
 if p_provider_mode<>'real' then raise exception 'Runway Forge credential requires real provider mode' using errcode='42501'; end if;
 hold_id:=extensions.uuid_generate_v5(b.reservation_id,'aggregate-exposure');
 admitted:=tongs.reserve_restricted_beta_exposure(hold_id,a.policy_revision_id,'runway.video',b.operation_id,b.user_id,b.workspace_id,b.operation_fingerprint,b.model||':'||b.duration_seconds::text||'s:'||b.ratio,funding_class,b.reservation_id::text,p_provider_mode,p_caller_class,r.reserved_customer_charge_micros,b.direct_provider_ceiling_micros,b.supporting_cost_ceiling_micros,0,0,0,300,b.reservation_id::text||':aggregate-reserved');
 if coalesce((admitted->>'authorized')::boolean,false) then
  insert into tongs.paid_operation_aggregate_bindings(reservation_id,hold_id,policy_revision_id,capability_code,provider,operation_id,user_id,workspace_id,request_fingerprint,model_or_sku,funding_source_type,credential_funding,provider_mode,pricing_revision_id,cost_policy_revision_id,customer_funding_ceiling_micros,supplier_exposure_ceiling_micros,supporting_exposure_ceiling_micros)
  values(r.id,hold_id,a.policy_revision_id,'runway.video','runway',b.operation_id,b.user_id,b.workspace_id,b.operation_fingerprint,b.model||':'||b.duration_seconds::text||'s:'||b.ratio,r.funding_source_type,'forge',p_provider_mode,b.pricing_revision_id,null,r.reserved_customer_charge_micros,b.direct_provider_ceiling_micros,b.supporting_cost_ceiling_micros);
 end if;
 return jsonb_build_object('enforcement_enabled',true)||admitted;
end
$$;

revoke all on function tongs.create_owner_only_openai_text_execution_scope_authorization(uuid,uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function tongs.create_owner_only_openai_text_execution_scope_authorization(uuid,uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,text) to service_role;
revoke all on function tongs._active_owner_only_paid_execution_scope(uuid,uuid,text,text,text,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function tongs._active_owner_only_paid_execution_scope(uuid,uuid,text,text,text,uuid,uuid) to service_role;

do $$
begin
  if exists(select 1 from tongs.customer_paid_execution_scope_authorizations where route_code='hammer.transcript_cleanup') then
    raise exception 'Slice 6A must not create Hammer execution authority';
  end if;
  if exists(
    select 1 from tongs.paid_execution_aggregate_assignments assignment
    join tongs.restricted_beta_policy_capabilities capability on capability.policy_revision_id=assignment.policy_revision_id
    where capability.capability_code='openai.text.hammer_cleanup'
  ) then
    raise exception 'Slice 6A must not create a Hammer aggregate assignment';
  end if;
  if (select mode from tongs.openai_text_rollout_revisions where route_code='hammer.transcript_cleanup' order by revision desc limit 1) <> 'halt_new' then
    raise exception 'Hammer must remain halt_new';
  end if;
end
$$;

notify pgrst, 'reload schema';
commit;
