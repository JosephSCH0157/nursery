-- Shared owner-only Test canary funding and scoped activation lane.
-- This migration activates only an already-staged, one-operation owner scope.
-- It does not change route rollout, call a provider, or create a quote/reservation.
begin;

alter table tongs.owner_operating_budgets
  drop constraint owner_operating_budgets_environment_check;
alter table tongs.owner_operating_budgets
  add constraint owner_operating_budgets_environment_check
  check (environment in ('production','preview','development','test'));

-- Preserve the established creator while admitting the canonical Test label.
do $$
declare definition text; changed text;
begin
  select pg_get_functiondef(
    'tongs.create_owner_testing_budget_draft(uuid,uuid,uuid,text,uuid,text,text,text,text,timestamptz,timestamptz,text)'::regprocedure
  ) into definition;
  changed := replace(definition,
    $old$p_environment not in ('production','preview','development')$old$,
    $new$p_environment not in ('production','preview','development','test')$new$);
  if changed=definition or position($needle$'development','test'$needle$ in changed)=0 then
    raise exception 'owner Test budget creator patch did not match authoritative definition';
  end if;
  execute changed;
end $$;

create table tongs.owner_paid_execution_canary_activation_revisions (
  id uuid primary key,
  execution_scope_authorization_id uuid not null
    references tongs.customer_paid_execution_scope_authorizations(id) on delete restrict,
  owner_budget_id uuid not null
    references tongs.owner_operating_budgets(id) on delete restrict,
  revision integer not null check (revision > 0),
  previous_revision_id uuid
    references tongs.owner_paid_execution_canary_activation_revisions(id) on delete restrict,
  state text not null check (state in ('active','revoked')),
  maximum_operation_count integer not null check (maximum_operation_count = 1),
  valid_from timestamptz not null,
  valid_until timestamptz not null,
  reason text not null check (length(btrim(reason)) between 8 and 500),
  actor_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(execution_scope_authorization_id,revision),
  check (valid_until > valid_from),
  check ((revision=1 and previous_revision_id is null) or (revision>1 and previous_revision_id is not null))
);

create unique index owner_paid_execution_canary_one_active_scope
  on tongs.owner_paid_execution_canary_activation_revisions(execution_scope_authorization_id)
  where state='active';
create unique index owner_paid_execution_canary_one_active_budget
  on tongs.owner_paid_execution_canary_activation_revisions(owner_budget_id)
  where state='active';

alter table tongs.owner_paid_execution_canary_activation_revisions enable row level security;
alter table tongs.owner_paid_execution_canary_activation_revisions force row level security;

create or replace function tongs._immutable_owner_paid_execution_canary_activation()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
  raise exception 'owner paid-execution canary activation evidence is append-only'
    using errcode='55000';
end $$;
create trigger owner_paid_execution_canary_activation_immutable
before update or delete on tongs.owner_paid_execution_canary_activation_revisions
for each row execute function tongs._immutable_owner_paid_execution_canary_activation();

create or replace function tongs._active_owner_paid_execution_canary_for_scope(
  p_scope_id uuid,
  p_budget_id uuid default null
) returns tongs.owner_paid_execution_canary_activation_revisions
language sql stable security definer set search_path=pg_catalog as $$
  select activation.*
  from tongs.owner_paid_execution_canary_activation_revisions activation
  join tongs.customer_paid_execution_scope_authorizations scope_auth
    on scope_auth.id=activation.execution_scope_authorization_id
  join tongs.owner_operating_budgets budget on budget.id=activation.owner_budget_id
  join lateral (
    select revision.* from tongs.owner_operating_budget_revisions revision
    where revision.budget_id=budget.id order by revision.revision desc limit 1
  ) budget_revision on true
  where activation.execution_scope_authorization_id=p_scope_id
    and (p_budget_id is null or activation.owner_budget_id=p_budget_id)
    and activation.state='active'
    and activation.valid_from<=now() and activation.valid_until>now()
    and scope_auth.authorization_kind='owner_only'
    and scope_auth.financial_environment='test'
    and scope_auth.status='active'
    and scope_auth.valid_from<=now() and scope_auth.valid_until>now()
    and scope_auth.maximum_operation_count=1 and scope_auth.maximum_concurrency=1
    and budget.environment='test'
    and budget.owner_testing_user_id=scope_auth.user_id
    and budget.workspace_id=scope_auth.workspace_id
    and lower(budget.provider)='openai'
    and budget.route=scope_auth.route_code
    and budget_revision.status='active'
    and budget_revision.maximum_amount_micros=scope_auth.maximum_wholesale_exposure_micros
    and now()>=budget.period_start and now()<budget.period_end
  order by activation.revision desc limit 1
$$;

create or replace function tongs._owner_paid_execution_canary_for_reservation(
  p_reservation_id uuid
) returns tongs.owner_paid_execution_canary_activation_revisions
language sql stable security definer set search_path=pg_catalog as $$
  select activation.*
  from tongs.funding_reservations reservation
  join tongs.openai_text_customer_quote_bindings quote_binding
    on quote_binding.quote_id=reservation.quote_id
  join tongs.customer_paid_execution_scope_authorizations scope_auth
    on scope_auth.id=reservation.rollout_authorization_id
  join lateral tongs._active_owner_paid_execution_canary_for_scope(
    scope_auth.id,reservation.funding_source_id
  ) activation on true
  where reservation.id=p_reservation_id
    and reservation.funding_source_type='owner_budget'
    and reservation.funding_environment='test'
    and reservation.user_id=scope_auth.user_id
    and quote_binding.user_id=scope_auth.user_id
    and quote_binding.workspace_id=scope_auth.workspace_id
    and quote_binding.route_code=scope_auth.route_code
    and quote_binding.runtime_model=scope_auth.model_or_sku
    and quote_binding.pricing_revision_id=scope_auth.pricing_revision_id
    and quote_binding.cost_policy_revision_id=scope_auth.cost_policy_revision_id
$$;

create or replace function tongs._owner_paid_execution_canary_for_choice(
  p_user_id uuid,p_workspace_id uuid,p_route_code text,p_model text
) returns table(activation_id uuid,scope_id uuid,budget_id uuid,pricing_revision_id uuid,cost_policy_revision_id uuid)
language sql stable security definer set search_path=pg_catalog as $$
  select activation.id,scope_auth.id,activation.owner_budget_id,
    scope_auth.pricing_revision_id,scope_auth.cost_policy_revision_id
  from tongs.customer_paid_execution_scope_authorizations scope_auth
  join lateral tongs._active_owner_paid_execution_canary_for_scope(scope_auth.id,null) activation on true
  where scope_auth.user_id=p_user_id and scope_auth.workspace_id=p_workspace_id
    and scope_auth.financial_environment='test'
    and scope_auth.route_code=btrim(p_route_code)
    and scope_auth.provider='openai' and scope_auth.model_or_sku=btrim(p_model)
  order by scope_auth.created_at desc limit 1
$$;

create or replace function tongs._activate_owner_paid_execution_test_canary(
  p_activation_id uuid,p_budget_id uuid,p_scope_id uuid,p_actor_id uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  scope_auth tongs.customer_paid_execution_scope_authorizations%rowtype;
  existing tongs.owner_paid_execution_canary_activation_revisions%rowtype;
  model record;
  pricing tongs.private_pricing_revisions%rowtype;
  rollout tongs.openai_text_rollout_revisions%rowtype;
  sku text;
  prior_sub text:=current_setting('request.jwt.claim.sub',true);
begin
  if p_activation_id is null or p_budget_id is null or p_scope_id is null
     or p_actor_id is null or not tongs.is_platform_operator(p_actor_id)
     or length(btrim(coalesce(p_reason,''))) not between 8 and 500 then
    raise exception 'invalid owner Test canary activation' using errcode='22023';
  end if;
  select * into existing from tongs.owner_paid_execution_canary_activation_revisions
    where id=p_activation_id;
  if found then
    if existing.execution_scope_authorization_id<>p_scope_id
       or existing.owner_budget_id<>p_budget_id then
      raise exception 'owner Test canary activation replay conflict' using errcode='23505';
    end if;
    return to_jsonb(existing)||jsonb_build_object('replay',true);
  end if;
  select * into scope_auth from tongs.customer_paid_execution_scope_authorizations where id=p_scope_id;
  if not found or scope_auth.authorization_kind<>'owner_only'
     or scope_auth.financial_environment<>'test' or scope_auth.status<>'active'
     or scope_auth.valid_from>now() or scope_auth.valid_until<=now()
     or scope_auth.maximum_operation_count<>1 or scope_auth.maximum_concurrency<>1
     or scope_auth.maximum_wholesale_exposure_micros<=0
     or not tongs._transition_owner_authority_agrees(scope_auth.user_id) then
    raise exception 'exact active one-operation owner-only Test scope required' using errcode='42501';
  end if;
  select * into model from tongs._eligible_ai_models_for_operation(scope_auth.route_code) eligible
    where eligible.runtime_model_id=scope_auth.model_or_sku
      and eligible.cost_policy_revision_id=scope_auth.cost_policy_revision_id;
  if not found then raise exception 'exact operation/model eligibility required' using errcode='42501'; end if;
  select * into pricing from tongs.private_pricing_revisions where id=scope_auth.pricing_revision_id;
  if not found or pricing.full_cost_ceiling_micros<>scope_auth.maximum_wholesale_exposure_micros
     or pricing.customer_credit_units<>model.customer_credit_units
     or pricing.markup_basis_points<>3300 then
    raise exception 'exact pricing and common markup authority required' using errcode='42501';
  end if;
  select * into rollout from tongs._current_openai_text_rollout(scope_auth.route_code);
  if not found or rollout.mode<>'halt_new' then
    raise exception 'general route must remain halt_new for owner canary' using errcode='42501';
  end if;
  if not exists(
    select 1 from tongs.paid_execution_aggregate_assignments assignment
    join tongs.restricted_beta_policy_revisions policy on policy.id=assignment.policy_revision_id
    join tongs.restricted_beta_policy_capabilities capability on capability.policy_revision_id=policy.id
    where assignment.user_id=scope_auth.user_id and assignment.workspace_id=scope_auth.workspace_id
      and assignment.state='active' and assignment.valid_from<=now() and assignment.valid_until>now()
      and policy.environment='test' and policy.lifecycle_state='active'
      and capability.capability_code='openai.text.hammer_cleanup'
      and capability.admission_mode='covered'
      and capability.exact_model_or_sku=scope_auth.model_or_sku
      and capability.maximum_attempts=1
      and capability.per_operation_supplier_ceiling_micros>=scope_auth.maximum_wholesale_exposure_micros
  ) then raise exception 'exact active Test aggregate assignment required' using errcode='42501'; end if;
  if exists(select 1 from tongs.owner_operating_budgets where id=p_budget_id) then
    raise exception 'owner Test canary budget id already exists' using errcode='23505';
  end if;
  sku:=lower('openai-text:'||scope_auth.route_code||':'||scope_auth.model_or_sku||':'||scope_auth.cost_policy_revision_id::text);
  perform set_config('request.jwt.claim.sub',p_actor_id::text,true);
  perform tongs.create_owner_testing_budget_draft(
    p_budget_id,scope_auth.user_id,p_actor_id,'test',scope_auth.workspace_id,
    'openai',scope_auth.route_code,sku,'USD',greatest(now(),scope_auth.valid_from),
    scope_auth.valid_until,btrim(p_reason));
  perform tongs.revise_owner_operating_budget(
    p_budget_id,'active',scope_auth.maximum_wholesale_exposure_micros,btrim(p_reason));
  perform set_config('request.jwt.claim.sub',coalesce(prior_sub,''),true);
  insert into tongs.owner_paid_execution_canary_activation_revisions(
    id,execution_scope_authorization_id,owner_budget_id,revision,previous_revision_id,state,
    maximum_operation_count,valid_from,valid_until,reason,actor_id
  ) values(p_activation_id,p_scope_id,p_budget_id,1,null,'active',1,
    greatest(now(),scope_auth.valid_from),scope_auth.valid_until,btrim(p_reason),p_actor_id)
  returning * into existing;
  return to_jsonb(existing)||jsonb_build_object(
    'replay',false,'budget_amount_micros',scope_auth.maximum_wholesale_exposure_micros);
exception when others then
  perform set_config('request.jwt.claim.sub',coalesce(prior_sub,''),true);
  raise;
end $$;

create or replace function tongs.activate_owner_paid_execution_test_canary(
  p_activation_id uuid,p_budget_id uuid,p_scope_id uuid,p_actor_id uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
  perform tongs._require_pricing_service_role();
  return tongs._activate_owner_paid_execution_test_canary(
    p_activation_id,p_budget_id,p_scope_id,p_actor_id,p_reason);
end $$;

create or replace function tongs.resolve_owner_openai_text_canary_eligibility(
  p_user_id uuid,p_workspace_id uuid,p_route_code text,p_model text
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare authority record;
begin
  perform tongs._require_pricing_service_role();
  select * into authority from tongs._owner_paid_execution_canary_for_choice(
    p_user_id,p_workspace_id,p_route_code,p_model);
  return jsonb_build_object('eligible',found,'financial_environment','test',
    'route_code',btrim(p_route_code),'model',btrim(p_model));
end $$;

-- Permit quote construction only when the exact private owner-canary authority exists.
do $$
declare definition text; changed text;
begin
  select pg_get_functiondef('tongs.create_customer_openai_text_quote(uuid,uuid,text,text,uuid,text,text,text,text,timestamptz)'::regprocedure)
    into definition;
  changed:=replace(definition,
    $old$if not found or v_rollout.mode<>'enforce' then raise exception 'OpenAI text customer spending is not active' using errcode='42501'; end if;$old$,
    $new$if not found or (v_rollout.mode<>'enforce' and not exists(select 1 from tongs._owner_paid_execution_canary_for_choice(p_user_id,p_workspace_id,p_route_code,p_model))) then raise exception 'OpenAI text customer spending is not active' using errcode='42501'; end if;$new$);
  if changed=definition or position('_owner_paid_execution_canary_for_choice' in changed)=0 then
    raise exception 'owner canary quote rollout patch did not match authoritative definition';
  end if;
  execute changed;
end $$;

create or replace function tongs.create_owner_openai_text_canary_quote(
 p_quote_id uuid,p_user_id uuid,p_operation_id text,p_route_code text,p_workspace_id uuid,p_workpiece_id text,
 p_request_fingerprint text,p_model text,p_credential_funding text,p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare result jsonb; quote_row tongs.customer_spending_quotes%rowtype;
begin
  perform tongs._require_pricing_service_role();
  if p_credential_funding<>'forge' or not exists(select 1 from tongs._owner_paid_execution_canary_for_choice(
    p_user_id,p_workspace_id,p_route_code,p_model)) then
    raise exception 'exact owner Test canary authority required' using errcode='42501';
  end if;
  result:=tongs.create_customer_openai_text_quote(
    p_quote_id,p_user_id,p_operation_id,p_route_code,p_workspace_id,p_workpiece_id,
    p_request_fingerprint,p_model,p_credential_funding,p_expires_at);
  select * into quote_row from tongs.customer_spending_quotes where id=p_quote_id;
  return result||jsonb_build_object(
    'customer_credit_units',quote_row.customer_credit_units,
    'maximum_customer_charge_micros',quote_row.normal_maximum_charge_micros,
    'funding_eligible',true,'funding_source','owner_budget','payer_kind','owner_testing',
    'funding_label','Forge Credits','funding_environment','test');
end $$;

create or replace function tongs.reserve_owner_openai_text_canary_quote(
 p_quote_id uuid,p_reservation_id uuid,p_user_id uuid,p_operation_id text,p_route_code text,p_workspace_id uuid,
 p_workpiece_id text,p_request_fingerprint text,p_model text,p_credential_funding text,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  quote_binding tongs.openai_text_customer_quote_bindings%rowtype;
  quote_row tongs.customer_spending_quotes%rowtype;
  authority record;
  cost tongs.openai_text_cost_policy_revisions%rowtype;
  reserved jsonb;
  existing tongs.openai_text_funding_bindings%rowtype;
  rollout tongs.openai_text_rollout_revisions%rowtype;
begin
  perform tongs._require_pricing_service_role();
  perform pg_advisory_xact_lock(hashtextextended('openai-text-owner-canary:'||p_user_id::text||':'||btrim(p_operation_id),0));
  if p_credential_funding<>'forge' then raise exception 'Forge credential funding required' using errcode='42501'; end if;
  select * into authority from tongs._owner_paid_execution_canary_for_choice(
    p_user_id,p_workspace_id,p_route_code,p_model);
  if not found then raise exception 'exact owner Test canary authority required' using errcode='42501'; end if;
  select * into quote_binding from tongs.openai_text_customer_quote_bindings where quote_id=p_quote_id;
  select * into quote_row from tongs.customer_spending_quotes where id=p_quote_id;
  if quote_binding.quote_id is null or quote_row.id is null or quote_binding.user_id<>p_user_id
     or quote_binding.canonical_operation_id<>btrim(p_operation_id) or quote_binding.route_code<>p_route_code
     or quote_binding.workspace_id<>p_workspace_id or quote_binding.workpiece_id<>btrim(p_workpiece_id)
     or quote_binding.request_fingerprint<>p_request_fingerprint or quote_binding.runtime_model<>btrim(p_model)
     or quote_binding.credential_funding<>'forge'
     or quote_binding.pricing_revision_id<>authority.pricing_revision_id
     or quote_binding.cost_policy_revision_id<>authority.cost_policy_revision_id
     or not exists(select 1 from tongs.customer_spending_quote_acceptances acceptance
       where acceptance.quote_id=p_quote_id and acceptance.user_id=p_user_id
         and acceptance.accepted_quote_hash=quote_row.quote_hash) then
    raise exception 'accepted exact owner canary quote required' using errcode='42501';
  end if;
  if quote_row.expires_at<=now() and not exists(select 1 from tongs.funding_reservations where quote_id=p_quote_id) then
    raise exception 'spending quote expired' using errcode='P0001';
  end if;
  select * into cost from tongs.openai_text_cost_policy_revisions where id=authority.cost_policy_revision_id;
  if cost.id is null or cost.maximum_attempts<>1 or cost.full_cost_ceiling_micros<>quote_row.full_cost_ceiling_micros then
    raise exception 'exact bounded cost authority required' using errcode='42501';
  end if;
  reserved:=tongs.reserve_operation(p_reservation_id,p_quote_id,'owner_budget',authority.budget_id,p_idempotency_key);
  select * into rollout from tongs._current_openai_text_rollout(p_route_code);
  select * into existing from tongs.openai_text_funding_bindings where operation_id=btrim(p_operation_id);
  if found then
    if existing.reservation_id<>p_reservation_id or existing.route_code<>p_route_code
       or existing.model<>btrim(p_model) or existing.cost_policy_revision_id<>cost.id then
      raise exception 'OpenAI binding replay conflict' using errcode='23505';
    end if;
  else
    insert into tongs.openai_text_funding_bindings(
      operation_id,route_code,reservation_id,credential_funding,model,pricing_revision_id,
      maximum_input_units,maximum_output_units,maximum_attempts,cost_policy_revision_id,rollout_revision
    ) values(btrim(p_operation_id),p_route_code,p_reservation_id,'forge',btrim(p_model),
      authority.pricing_revision_id,cost.maximum_input_units,cost.maximum_output_units,
      cost.maximum_attempts,cost.id,rollout.revision);
  end if;
  return jsonb_build_object('paid_execution',jsonb_build_object(
    'operation_id',btrim(p_operation_id),'reservation_id',p_reservation_id,
    'request_fingerprint',p_request_fingerprint,'funding_environment','test'),
    'reservation_state',tongs._funding_reservation_state(p_reservation_id),
    'funding_source','owner_budget','replay',coalesce((reserved->>'replay')::boolean,false));
end $$;

-- Stamp owner-canary reservations as Test and bind the exact owner_only scope.
create or replace function tongs._stamp_and_authorize_funding_reservation()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare
  quote_row tongs.customer_spending_quotes%rowtype;
  source_environment text;
  quote_binding tongs.openai_text_customer_quote_bindings%rowtype;
  scope_auth tongs.customer_paid_execution_scope_authorizations%rowtype;
  activation tongs.owner_paid_execution_canary_activation_revisions%rowtype;
  prior_count bigint; active_count bigint;
begin
  select * into quote_row from tongs.customer_spending_quotes where id=new.quote_id;
  if not found then raise exception 'spending quote not found' using errcode='P0002'; end if;
  if new.funding_source_type='customer_deposit' then
    select stripe_mode into source_environment from tongs.customer_deposits where id=new.funding_source_id;
  elsif new.funding_source_type='paid_allowance' then
    select financial_environment into source_environment from tongs.paid_allowance_grants where id=new.funding_source_id;
  elsif new.funding_source_type='beta_grant' then
    select financial_environment into source_environment from tongs.beta_credit_grants where id=new.funding_source_id;
  elsif new.funding_source_type='owner_budget' then
    select * into quote_binding from tongs.openai_text_customer_quote_bindings where quote_id=new.quote_id;
    select scope.* into scope_auth
    from tongs.customer_paid_execution_scope_authorizations scope
    join lateral tongs._active_owner_paid_execution_canary_for_scope(scope.id,new.funding_source_id) canary on true
    where scope.user_id=new.user_id and scope.workspace_id=quote_binding.workspace_id
      and scope.route_code=quote_binding.route_code and scope.model_or_sku=quote_binding.runtime_model
      and scope.pricing_revision_id=quote_binding.pricing_revision_id
      and scope.cost_policy_revision_id=quote_binding.cost_policy_revision_id
    order by scope.created_at desc limit 1;
    if found then source_environment:='test'; else source_environment:='owner_internal'; end if;
  else source_environment:=quote_row.financial_environment;
  end if;
  if source_environment is null then raise exception 'funding source environment is unavailable' using errcode='P0002'; end if;
  if new.funding_source_type in('customer_deposit','paid_allowance','beta_grant')
     and source_environment<>quote_row.financial_environment then
    raise exception 'cross-environment customer funding is forbidden' using errcode='42501';
  end if;
  new.funding_environment:=source_environment;
  if new.funding_source_type='owner_budget' and source_environment='test' then
    select * into activation from tongs._active_owner_paid_execution_canary_for_scope(scope_auth.id,new.funding_source_id);
    if activation.id is null
       or new.reserved_wholesale_spend_micros>scope_auth.maximum_wholesale_exposure_micros
       or new.reserved_customer_charge_micros<>0 or new.reserved_credit_units<>0 then
      raise exception 'exact owner canary funding authority required' using errcode='42501';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('paid-scope:'||scope_auth.id::text,0));
    select count(*) into prior_count from tongs.funding_reservations
      where rollout_authorization_id=scope_auth.id;
    if prior_count>=1 then raise exception 'owner canary operation limit reached' using errcode='P0001'; end if;
    select count(*) into active_count from tongs.funding_reservations reservation
      where reservation.rollout_authorization_id=scope_auth.id
        and tongs._funding_reservation_counts_paid_scope_concurrency(reservation.id);
    if active_count>=1 then raise exception 'owner canary concurrency limit reached' using errcode='P0001'; end if;
    new.rollout_authorization_id:=scope_auth.id;
    return new;
  end if;
  if new.funding_source_type not in('customer_deposit','paid_allowance','beta_grant') then return new; end if;
  select * into quote_binding from tongs.openai_text_customer_quote_bindings where quote_id=new.quote_id;
  if not found then raise exception 'generic paid execution authorization requires an immutable provider quote binding' using errcode='42501'; end if;
  select scope.* into scope_auth from tongs.customer_paid_execution_scope_authorizations scope
  where scope.user_id=new.user_id and scope.workspace_id=quote_binding.workspace_id
    and scope.financial_environment=source_environment and scope.route_code=quote_binding.route_code
    and scope.provider='openai' and scope.model_or_sku=quote_binding.runtime_model
    and scope.pricing_revision_id=quote_binding.pricing_revision_id
    and scope.cost_policy_revision_id=quote_binding.cost_policy_revision_id
    and scope.authorization_kind in('certification','normal_customer')
    and scope.status='active' and scope.valid_from<=now() and(scope.valid_until is null or scope.valid_until>now())
  order by(scope.authorization_kind='normal_customer') desc,scope.created_at desc limit 1;
  if not found or new.reserved_customer_charge_micros>scope_auth.maximum_customer_charge_micros
     or new.reserved_wholesale_spend_micros>scope_auth.maximum_wholesale_exposure_micros then
    raise exception 'customer paid execution is not authorized for this scope' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('paid-scope:'||scope_auth.id::text,0));
  if scope_auth.maximum_operation_count is not null then
    select count(*) into prior_count from tongs.funding_reservations where rollout_authorization_id=scope_auth.id;
    if prior_count>=scope_auth.maximum_operation_count then raise exception 'customer paid execution operation limit reached' using errcode='P0001'; end if;
  end if;
  select count(*) into active_count from tongs.funding_reservations reservation
    where reservation.rollout_authorization_id=scope_auth.id
      and tongs._funding_reservation_counts_paid_scope_concurrency(reservation.id);
  if active_count>=scope_auth.maximum_concurrency then raise exception 'customer paid execution concurrency limit reached' using errcode='P0001'; end if;
  new.rollout_authorization_id:=scope_auth.id;
  return new;
end $$;

-- Scoped owner canaries alone may cross route halt_new at aggregate admission.
do $$
declare definition text; changed text;
begin
  select pg_get_functiondef('tongs.acquire_openai_text_aggregate_admission(uuid,text,text)'::regprocedure) into definition;
  changed:=replace(definition,
    $old$if rollout.mode<>'enforce' then
  return jsonb_build_object('enforcement_enabled',false,'authorized',false,'replay',false,'reason','rollout_halt_new');
 end if;$old$,
    $new$if rollout.mode<>'enforce' and not exists(select 1 from tongs._owner_paid_execution_canary_for_reservation(p_reservation_id)) then
  return jsonb_build_object('enforcement_enabled',false,'authorized',false,'replay',false,'reason','rollout_halt_new');
 end if;$new$);
  if changed=definition or position('_owner_paid_execution_canary_for_reservation' in changed)=0 then
    raise exception 'owner canary aggregate rollout patch did not match authoritative definition';
  end if;
  execute changed;
end $$;

-- The funding gate keeps all existing loss, attempt, budget, and settlement
-- behavior. Only the exact scoped reservation can cross the two halt_new checks.
do $$
declare definition text; changed text;
begin
  select pg_get_functiondef(
    'tongs._authorize_openai_text_provider_attempt_before_customer_test_sc(uuid,text,smallint,bigint,integer,jsonb)'::regprocedure
  ) into definition;
  changed:=replace(definition,
    $old$if route_rollout.mode<>'enforce'
    or route_rollout.cost_policy_revision_id is distinct from binding.cost_policy_revision_id then$old$,
    $new$if (route_rollout.mode<>'enforce' and not exists(select 1 from tongs._owner_paid_execution_canary_for_reservation(p_reservation_id)))
    or (route_rollout.mode='enforce' and route_rollout.cost_policy_revision_id is distinct from binding.cost_policy_revision_id) then$new$);
  changed:=replace(changed,
    $old$if risk_rollout.mode='halt_new' then
      return jsonb_build_object($old$,
    $new$if risk_rollout.mode='halt_new' and exists(select 1 from tongs._owner_paid_execution_canary_for_reservation(p_reservation_id)) then
      effective_aggregate_limit_micros:=policy.aggregate_limit_micros;
    elsif risk_rollout.mode='halt_new' then
      return jsonb_build_object($new$);
  if changed=definition
     or position('_owner_paid_execution_canary_for_reservation' in changed)=0
     or position('effective_aggregate_limit_micros:=policy.aggregate_limit_micros' in changed)=0 then
    raise exception 'owner canary provider-boundary patch did not match authoritative definition';
  end if;
  execute changed;
end $$;

-- Connected application is deterministic and no-ops on fresh/isolated databases.
-- It creates authority only when exactly one already-staged valid scope exists.
do $$
declare scope_auth tongs.customer_paid_execution_scope_authorizations%rowtype;
  actor uuid; scope_count bigint; activation_id uuid; budget_id uuid;
  prior_role text:=current_setting('request.jwt.claim.role',true);
begin
  select count(*) into scope_count
  from tongs.customer_paid_execution_scope_authorizations scope
  where scope.authorization_kind='owner_only' and scope.financial_environment='test'
    and scope.route_code='hammer.transcript_cleanup' and scope.provider='openai'
    and scope.model_or_sku='gpt-5.4-mini' and scope.maximum_operation_count=1
    and scope.maximum_concurrency=1 and scope.status='active'
    and scope.valid_from<=now() and scope.valid_until>now();
  if scope_count=1 then
    select * into scope_auth from tongs.customer_paid_execution_scope_authorizations scope
    where scope.authorization_kind='owner_only' and scope.financial_environment='test'
      and scope.route_code='hammer.transcript_cleanup' and scope.provider='openai'
      and scope.model_or_sku='gpt-5.4-mini' and scope.maximum_operation_count=1
      and scope.maximum_concurrency=1 and scope.status='active'
      and scope.valid_from<=now() and scope.valid_until>now();
    select user_id into actor from tongs.platform_operators order by granted_at limit 1;
    activation_id:=extensions.uuid_generate_v5(scope_auth.id,'owner-paid-execution-test-canary-activation');
    budget_id:=extensions.uuid_generate_v5(scope_auth.id,'owner-paid-execution-test-canary-budget');
    perform set_config('request.jwt.claim.role','service_role',true);
    perform tongs._activate_owner_paid_execution_test_canary(
      activation_id,budget_id,scope_auth.id,actor,
      'Approved Slice 6C.1 single-operation owner-only Test canary authority.');
    perform set_config('request.jwt.claim.role',coalesce(prior_role,''),true);
  elsif scope_count>1 then
    raise exception 'ambiguous active owner-only Hammer Test scopes; refusing canary activation';
  end if;
exception when others then
  perform set_config('request.jwt.claim.role',coalesce(prior_role,''),true);
  raise;
end $$;

revoke all on table tongs.owner_paid_execution_canary_activation_revisions from public,anon,authenticated;
revoke all on function tongs._immutable_owner_paid_execution_canary_activation() from public,anon,authenticated,service_role;
revoke all on function tongs._active_owner_paid_execution_canary_for_scope(uuid,uuid) from public,anon,authenticated;
revoke all on function tongs._owner_paid_execution_canary_for_reservation(uuid) from public,anon,authenticated;
revoke all on function tongs._owner_paid_execution_canary_for_choice(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function tongs._activate_owner_paid_execution_test_canary(uuid,uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function tongs.activate_owner_paid_execution_test_canary(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function tongs.resolve_owner_openai_text_canary_eligibility(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function tongs.create_owner_openai_text_canary_quote(uuid,uuid,text,text,uuid,text,text,text,text,timestamptz) from public,anon,authenticated;
revoke all on function tongs.reserve_owner_openai_text_canary_quote(uuid,uuid,uuid,text,text,uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function tongs.activate_owner_paid_execution_test_canary(uuid,uuid,uuid,uuid,text) to service_role;
grant execute on function tongs.resolve_owner_openai_text_canary_eligibility(uuid,uuid,text,text) to service_role;
grant execute on function tongs.create_owner_openai_text_canary_quote(uuid,uuid,text,text,uuid,text,text,text,text,timestamptz) to service_role;
grant execute on function tongs.reserve_owner_openai_text_canary_quote(uuid,uuid,uuid,text,text,uuid,text,text,text,text,text) to service_role;

comment on table tongs.owner_paid_execution_canary_activation_revisions is
  'Private append-only authority binding one owner_only scope to one exact owner budget. It grants no route-wide or customer execution authority.';

notify pgrst,'reload schema';
commit;
