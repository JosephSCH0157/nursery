-- Scoped customer-funded activation for the already-proven bounded Hearth Luna route.
-- No identity, funding, publication, or activation is seeded by this migration.

begin;

create table tongs.customer_paid_execution_test_authorizations (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete restrict,
  workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
  route_code text not null check (route_code = 'hearth.chat_completion'),
  provider text not null check (provider = 'openai'),
  model text not null check (model = 'gpt-5.6-luna'),
  pricing_revision_id uuid not null references tongs.private_pricing_revisions(id) on delete restrict,
  cost_policy_revision_id uuid not null references tongs.openai_text_cost_policy_revisions(id) on delete restrict,
  maximum_operation_count integer not null check (maximum_operation_count = 1),
  maximum_customer_charge_micros bigint not null check (maximum_customer_charge_micros = 20000),
  authorization_expires_at timestamptz not null,
  reason text not null check (nullif(btrim(reason), '') is not null),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (authorization_expires_at > created_at)
);

create table tongs.customer_paid_execution_test_authorization_revisions (
  authorization_id uuid not null references tongs.customer_paid_execution_test_authorizations(id) on delete restrict,
  revision integer not null check (revision > 0),
  status text not null check (status in ('active', 'closed')),
  reason text not null check (nullif(btrim(reason), '') is not null),
  actor_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (authorization_id, revision)
);

create table tongs.customer_paid_execution_test_authorization_quotes (
  authorization_id uuid primary key references tongs.customer_paid_execution_test_authorizations(id) on delete restrict,
  quote_id uuid not null unique references tongs.customer_spending_quotes(id) on delete restrict,
  created_at timestamptz not null default now()
);

do $$ declare v_table text; begin
  foreach v_table in array array[
    'customer_paid_execution_test_authorizations',
    'customer_paid_execution_test_authorization_revisions',
    'customer_paid_execution_test_authorization_quotes'
  ] loop
    execute format('alter table tongs.%I enable row level security', v_table);
    execute format('alter table tongs.%I force row level security', v_table);
    execute format('revoke all on tongs.%I from public, anon, authenticated, service_role', v_table);
    execute format('grant select on tongs.%I to service_role', v_table);
    execute format('create trigger %I_immutable before update or delete on tongs.%I for each row execute function tongs._reject_accounting_mutation()', v_table, v_table);
  end loop;
end $$;

create or replace function tongs._active_customer_paid_execution_test_authorization_for_quote(p_quote_id uuid)
returns tongs.customer_paid_execution_test_authorizations
language sql stable security definer set search_path=pg_catalog as $$
  select a.*
  from tongs.customer_paid_execution_test_authorization_quotes binding
  join tongs.customer_paid_execution_test_authorizations a
    on a.id=binding.authorization_id
  join lateral (
    select revision.status
    from tongs.customer_paid_execution_test_authorization_revisions revision
    where revision.authorization_id=a.id
    order by revision.revision desc limit 1
  ) latest on true
  where binding.quote_id=p_quote_id
    and latest.status='active'
    and clock_timestamp()<a.authorization_expires_at;
$$;

create or replace function tongs._enforce_scoped_customer_paid_reservation()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_quote tongs.customer_spending_quotes%rowtype;
  v_authorization tongs.customer_paid_execution_test_authorizations%rowtype;
begin
  if new.funding_source_type not in ('customer_deposit','paid_allowance') then
    return new;
  end if;
  select * into v_quote from tongs.customer_spending_quotes where id=new.quote_id;
  select * into v_authorization
    from tongs._active_customer_paid_execution_test_authorization_for_quote(new.quote_id);
  if not found
     or v_authorization.user_id<>new.user_id
     or v_authorization.user_id<>v_quote.user_id
     or v_authorization.workspace_id is distinct from v_quote.workspace_id
     or v_authorization.route_code<>v_quote.tool
     or v_authorization.pricing_revision_id<>v_quote.pricing_revision_id
     or v_quote.normal_maximum_charge_micros>v_authorization.maximum_customer_charge_micros then
    raise exception 'customer paid execution is not authorized for this test scope' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('customer-paid-test-authorization:'||v_authorization.id::text,0));
  if exists (
    select 1
    from tongs.customer_paid_execution_test_authorization_quotes authorization_quote
    join tongs.funding_reservations reservation on reservation.quote_id=authorization_quote.quote_id
    where authorization_quote.authorization_id=v_authorization.id
      and reservation.id<>new.id
  ) then
    raise exception 'customer paid test operation limit reached' using errcode='P0001';
  end if;
  return new;
end $$;

create trigger funding_reservations_customer_test_scope
before insert on tongs.funding_reservations
for each row execute function tongs._enforce_scoped_customer_paid_reservation();

create or replace function tongs.activate_customer_hearth_chat_luna_test(
  p_authorization_id uuid,
  p_operator_user_id uuid,
  p_user_id uuid,
  p_workspace_id uuid,
  p_pricing_revision_id uuid,
  p_cost_policy_revision_id uuid,
  p_publication_id uuid,
  p_authorization_expires_at timestamptz,
  p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_now timestamptz:=clock_timestamp();
  v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
  v_pricing tongs.private_pricing_revisions%rowtype;
  v_policy tongs.private_pricing_policies%rowtype;
  v_cost tongs.openai_text_cost_policy_revisions%rowtype;
  v_existing tongs.customer_paid_execution_test_authorizations%rowtype;
  v_current_publication tongs.private_pricing_publications%rowtype;
  v_control tongs.paid_execution_control_revisions%rowtype;
  v_rollout tongs.openai_text_rollout_revisions%rowtype;
  v_control_revision integer;
  v_rollout_revision integer;
  v_publication jsonb;
begin
  perform tongs._require_pricing_service_role();
  if p_authorization_id is null or p_publication_id is null or p_operator_user_id is null
     or not tongs.is_platform_operator(p_operator_user_id) or p_user_id is null
     or p_workspace_id is null or p_pricing_revision_id is null or p_cost_policy_revision_id is null
     or v_reason is null or p_authorization_expires_at<=v_now
     or p_authorization_expires_at>v_now+interval '24 hours' then
    raise exception 'invalid bounded customer Hearth Luna activation' using errcode='22023';
  end if;
  if not exists (
    select 1 from tongs.workspaces workspace
    where workspace.id=p_workspace_id and (
      workspace.created_by=p_user_id or exists (
        select 1 from tongs.workspace_members member
        where member.workspace_id=workspace.id and member.user_id=p_user_id
      )
    )
  ) then
    raise exception 'test customer cannot access designated workspace' using errcode='42501';
  end if;
  select * into v_existing from tongs.customer_paid_execution_test_authorizations
    where id=p_authorization_id;
  if found then
    if v_existing.user_id<>p_user_id or v_existing.workspace_id<>p_workspace_id
       or v_existing.pricing_revision_id<>p_pricing_revision_id
       or v_existing.cost_policy_revision_id<>p_cost_policy_revision_id
       or v_existing.authorization_expires_at<>p_authorization_expires_at then
      raise exception 'customer Hearth Luna activation replay conflict' using errcode='23505';
    end if;
    return jsonb_build_object('authorization_id',v_existing.id,'replay',true,
      'status',(select revision.status from tongs.customer_paid_execution_test_authorization_revisions revision
        where revision.authorization_id=v_existing.id order by revision.revision desc limit 1),
      'maximum_operation_count',1,'maximum_customer_charge_micros',20000);
  end if;
  select * into v_pricing from tongs.private_pricing_revisions where id=p_pricing_revision_id;
  select * into v_policy from tongs.private_pricing_policies where id=v_pricing.policy_id;
  select * into v_cost from tongs.openai_text_cost_policy_revisions where id=p_cost_policy_revision_id;
  if v_pricing.id is null or v_policy.id is null or v_cost.id is null
     or v_pricing.lifecycle_state<>'review_ready' or v_pricing.currency<>'USD'
     or v_pricing.markup_basis_points<>3300 or v_pricing.full_cost_ceiling_micros<>11015
     or v_pricing.failure_cost_ceiling_micros<>0
     or tongs.round_customer_price_micros(
       v_pricing.full_cost_ceiling_micros::numeric*(10000+v_pricing.markup_basis_points)/10000,
       v_pricing.currency
     )<>20000
     or v_policy.scope_kind<>'sku' or lower(v_policy.provider)<>'openai'
     or lower(v_policy.sku)<>'gpt-5.6-luna'
     or v_cost.route_code<>'hearth.chat_completion' or v_cost.full_cost_ceiling_micros<>11015
     or v_cost.maximum_input_units<>2000 or v_cost.maximum_output_units<>512
     or v_cost.maximum_attempts<>1 or v_cost.cost_coverage<>'complete'
     or v_cost.lifecycle_state not in ('pilot_candidate','active') then
    raise exception 'exact approved Hearth Luna customer pricing and cost revisions required' using errcode='P0001';
  end if;
  if not exists (
    select 1 from tongs.openai_text_failure_loss_policy_revisions failure_policy
    where failure_policy.route_code='hearth.chat_completion'
      and failure_policy.environment='production' and failure_policy.lifecycle_state='active'
      and failure_policy.per_operation_limit_micros>=11015
      and failure_policy.aggregate_limit_micros>=11015
      and failure_policy.maximum_concurrency=1
  ) then
    raise exception 'bounded Forge failure-loss policy is not active' using errcode='P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('customer-hearth-luna-test-activation',0));
  if exists (
    select 1 from tongs.customer_paid_execution_test_authorizations a
    join lateral (
      select revision.status from tongs.customer_paid_execution_test_authorization_revisions revision
      where revision.authorization_id=a.id order by revision.revision desc limit 1
    ) latest on true
    where a.route_code='hearth.chat_completion' and latest.status='active'
      and clock_timestamp()<a.authorization_expires_at
  ) then
    raise exception 'another customer Hearth paid test authorization is active' using errcode='P0001';
  end if;
  select distinct on (publication.policy_id) publication.* into v_current_publication
  from tongs.private_pricing_publications publication
  where publication.policy_id=v_policy.id
  order by publication.policy_id,publication.publication_revision desc;
  if v_current_publication.action is distinct from 'published'
     or v_current_publication.pricing_revision_id is distinct from v_pricing.id then
    perform set_config('request.jwt.claim.sub',p_operator_user_id::text,true);
    v_publication:=tongs.publish_private_pricing_revision(
      p_publication_id,p_pricing_revision_id,v_reason
    );
  else
    v_publication:=jsonb_build_object('publication_id',v_current_publication.id,
      'pricing_revision_id',v_current_publication.pricing_revision_id,'replay',true);
  end if;
  select * into v_control from tongs._current_paid_execution_control();
  if not v_control.pricing_activation_enabled or not v_control.provider_execution_enabled then
    raise exception 'provider execution controls are not active' using errcode='42501';
  end if;
  if not v_control.customer_settlement_enabled then
    select coalesce(max(revision),0)+1 into v_control_revision
      from tongs.paid_execution_control_revisions;
    insert into tongs.paid_execution_control_revisions(
      revision,pricing_activation_enabled,reservation_shadow_enabled,customer_settlement_enabled,
      owner_budget_spending_enabled,provider_execution_enabled,reason,actor_id
    ) values (
      v_control_revision,true,true,true,v_control.owner_budget_spending_enabled,true,v_reason,p_operator_user_id
    );
  else
    v_control_revision:=v_control.revision;
  end if;
  select * into v_rollout from tongs._current_openai_text_rollout('hearth.chat_completion');
  if v_rollout.mode<>'enforce' or v_rollout.cost_policy_revision_id is distinct from v_cost.id then
    select coalesce(max(revision),0)+1 into v_rollout_revision
      from tongs.openai_text_rollout_revisions where route_code='hearth.chat_completion';
    insert into tongs.openai_text_rollout_revisions(
      route_code,revision,mode,cost_policy_revision_id,reason,actor_id
    ) values ('hearth.chat_completion',v_rollout_revision,'enforce',v_cost.id,v_reason,p_operator_user_id);
  else
    v_rollout_revision:=v_rollout.revision;
  end if;
  insert into tongs.customer_paid_execution_test_authorizations(
    id,user_id,workspace_id,route_code,provider,model,pricing_revision_id,
    cost_policy_revision_id,maximum_operation_count,maximum_customer_charge_micros,
    authorization_expires_at,reason,created_by
  ) values (
    p_authorization_id,p_user_id,p_workspace_id,'hearth.chat_completion','openai','gpt-5.6-luna',
    p_pricing_revision_id,p_cost_policy_revision_id,1,20000,p_authorization_expires_at,v_reason,p_operator_user_id
  );
  insert into tongs.customer_paid_execution_test_authorization_revisions(
    authorization_id,revision,status,reason,actor_id
  ) values (p_authorization_id,1,'active',v_reason,p_operator_user_id);
  return jsonb_build_object('authorization_id',p_authorization_id,'replay',false,'status','active',
    'publication',v_publication,'pricing_revision_id',p_pricing_revision_id,
    'cost_policy_revision_id',p_cost_policy_revision_id,'control_revision',v_control_revision,
    'rollout_revision',v_rollout_revision,'maximum_operation_count',1,
    'maximum_customer_charge_micros',20000,'authorization_expires_at',p_authorization_expires_at);
end $$;

create or replace function tongs.create_customer_hearth_chat_quote(
  p_quote_id uuid,
  p_user_id uuid,
  p_operation_id text,
  p_workspace_id uuid,
  p_request_fingerprint text,
  p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_authorization tongs.customer_paid_execution_test_authorizations%rowtype;
  v_pricing tongs.private_pricing_revisions%rowtype;
  v_quote tongs.customer_spending_quotes%rowtype;
  v_control tongs.paid_execution_control_revisions%rowtype;
  v_rollout tongs.openai_text_rollout_revisions%rowtype;
  v_create jsonb;
  v_funding jsonb;
begin
  perform tongs._require_pricing_service_role();
  select a.* into v_authorization
  from tongs.customer_paid_execution_test_authorizations a
  join lateral (
    select revision.status from tongs.customer_paid_execution_test_authorization_revisions revision
    where revision.authorization_id=a.id order by revision.revision desc limit 1
  ) latest on true
  where a.user_id=p_user_id and a.workspace_id=p_workspace_id
    and a.route_code='hearth.chat_completion' and a.model='gpt-5.6-luna'
    and latest.status='active' and clock_timestamp()<a.authorization_expires_at
  order by a.created_at desc limit 1;
  if not found then
    raise exception 'customer Hearth paid test authorization is not active' using errcode='42501';
  end if;
  if p_expires_at>v_authorization.authorization_expires_at
     or p_expires_at>clock_timestamp()+interval '10 minutes' then
    raise exception 'quote expiry exceeds bounded authorization' using errcode='22023';
  end if;
  select * into v_pricing from tongs._published_pricing_revision('openai','gpt-5.6-luna');
  select * into v_rollout from tongs._current_openai_text_rollout('hearth.chat_completion');
  select * into v_control from tongs._current_paid_execution_control();
  if v_pricing.id is distinct from v_authorization.pricing_revision_id
     or v_rollout.mode<>'enforce'
     or v_rollout.cost_policy_revision_id is distinct from v_authorization.cost_policy_revision_id then
    raise exception 'pricing_not_configured' using errcode='P0001';
  end if;
  v_create:=tongs.create_shadow_spending_quote(
    p_quote_id,p_user_id,p_operation_id,'hearth.chat_completion',p_workspace_id,
    v_pricing.id,p_request_fingerprint,
    jsonb_build_array(
      jsonb_build_object('component','text_generation','provider_label','OpenAI','credential_source','forge'),
      jsonb_build_object('component','validation_and_persistence','provider_label','Forge supporting services','credential_source','forge')
    ),p_expires_at
  );
  select * into v_quote from tongs.customer_spending_quotes where id=p_quote_id;
  insert into tongs.customer_paid_execution_test_authorization_quotes(authorization_id,quote_id)
    values(v_authorization.id,v_quote.id)
    on conflict (authorization_id) do nothing;
  if not exists (
    select 1 from tongs.customer_paid_execution_test_authorization_quotes binding
    where binding.authorization_id=v_authorization.id and binding.quote_id=v_quote.id
  ) then
    raise exception 'customer paid test operation limit reached' using errcode='P0001';
  end if;
  v_funding:=tongs._select_customer_funding_for_quote(v_quote.id);
  return jsonb_build_object(
    'quote_id',v_quote.id,'operation_id',v_quote.operation_id,'quote_hash',v_quote.quote_hash,
    'request_fingerprint',v_quote.request_fingerprint,'currency',v_quote.currency,
    'normal_maximum_charge_micros',v_quote.normal_maximum_charge_micros,
    'billable_failure_maximum_charge_micros',0,
    'free_failure_classes',v_quote.free_failure_classes,
    'included_quantity',v_quote.included_quantity,'retention_policy',v_quote.retention_policy,
    'provider_funding_summary',v_quote.provider_funding_summary,'expires_at',v_quote.expires_at,
    'funding',v_funding,'customer_spending_enabled',v_control.pricing_activation_enabled
      and v_control.customer_settlement_enabled and v_control.provider_execution_enabled,
    'requires_confirmation',true,'replay',coalesce((v_create->>'replay')::boolean,false)
  );
end $$;

create or replace function tongs.reserve_customer_hearth_chat_quote(
  p_quote_id uuid,
  p_reservation_id uuid,
  p_idempotency_key text,
  p_request_fingerprint text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_control tongs.paid_execution_control_revisions%rowtype;
  v_quote tongs.customer_spending_quotes%rowtype;
  v_authorization tongs.customer_paid_execution_test_authorizations%rowtype;
  v_existing tongs.funding_reservations%rowtype;
  v_funding jsonb;
  v_result jsonb;
  v_binding jsonb;
begin
  perform tongs._require_pricing_service_role();
  select * into v_control from tongs._current_paid_execution_control();
  if not v_control.pricing_activation_enabled or not v_control.customer_settlement_enabled
     or not v_control.provider_execution_enabled then
    raise exception 'customer spending is not activated' using errcode='42501';
  end if;
  select * into v_quote from tongs.customer_spending_quotes where id=p_quote_id;
  select * into v_authorization
    from tongs._active_customer_paid_execution_test_authorization_for_quote(p_quote_id);
  if v_quote.id is null or v_authorization.id is null
     or v_quote.tool<>'hearth.chat_completion'
     or v_quote.request_fingerprint<>p_request_fingerprint
     or v_quote.normal_maximum_charge_micros<>20000
     or v_quote.billable_failure_maximum_charge_micros<>0 then
    raise exception 'accepted Hearth quote is outside the authorized test scope' using errcode='42501';
  end if;
  select * into v_existing from tongs.funding_reservations where quote_id=p_quote_id;
  if found then
    if v_existing.id<>p_reservation_id or v_existing.idempotency_key<>btrim(p_idempotency_key) then
      raise exception 'operation reservation replay conflict' using errcode='23505';
    end if;
    v_funding:=jsonb_build_object('eligible',true,'funding_source',v_existing.funding_source_type,
      'funding_source_id',v_existing.funding_source_id,
      'customer_label',case v_existing.funding_source_type when 'customer_deposit' then 'Verified AI credit purchase' else 'Paid-plan allowance' end);
  else
    v_funding:=tongs._select_customer_funding_for_quote(p_quote_id);
    if not coalesce((v_funding->>'eligible')::boolean,false) then
      raise exception 'insufficient verified funding' using errcode='P0001';
    end if;
  end if;
  v_result:=tongs.reserve_operation(
    p_reservation_id,p_quote_id,v_funding->>'funding_source',
    (v_funding->>'funding_source_id')::uuid,p_idempotency_key
  );
  v_binding:=tongs.bind_openai_text_funding_reservation(
    v_quote.operation_id,'hearth.chat_completion',p_reservation_id,'forge','gpt-5.6-luna',
    v_authorization.cost_policy_revision_id
  );
  return jsonb_build_object('reservation_id',p_reservation_id,'operation_id',v_quote.operation_id,
    'request_fingerprint',v_quote.request_fingerprint,'state',v_result->>'state',
    'replay',coalesce((v_result->>'replay')::boolean,false),
    'funding_source',v_funding->>'funding_source','funding_label',v_funding->>'customer_label',
    'provider_execution_authorized',false,
    'binding_replay',coalesce((v_binding->>'replay')::boolean,false));
end $$;

alter function tongs.authorize_openai_text_provider_attempt(uuid,text,smallint,bigint,integer,jsonb)
  rename to _authorize_openai_text_provider_attempt_before_customer_test_scope;

create or replace function tongs.authorize_openai_text_provider_attempt(
  p_reservation_id uuid,p_attempt_key text,p_attempt_number smallint,p_failure_exposure_micros bigint,
  p_lease_seconds integer,p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_reservation tongs.funding_reservations%rowtype;
  v_authorization tongs.customer_paid_execution_test_authorizations%rowtype;
begin
  perform tongs._require_pricing_service_role();
  select * into v_reservation from tongs.funding_reservations where id=p_reservation_id;
  if not found then raise exception 'funding reservation not found' using errcode='P0002'; end if;
  if v_reservation.funding_source_type in ('customer_deposit','paid_allowance') then
    select * into v_authorization
      from tongs._active_customer_paid_execution_test_authorization_for_quote(v_reservation.quote_id);
    if not found then
      raise exception 'customer paid execution authorization is closed or expired' using errcode='42501';
    end if;
  end if;
  return tongs._authorize_openai_text_provider_attempt_before_customer_test_scope(
    p_reservation_id,p_attempt_key,p_attempt_number,p_failure_exposure_micros,
    p_lease_seconds,p_evidence_json
  );
end $$;

create or replace function tongs.close_customer_paid_execution_test_authorization_for_reservation(
  p_reservation_id uuid,
  p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
  v_authorization tongs.customer_paid_execution_test_authorizations%rowtype;
  v_latest tongs.customer_paid_execution_test_authorization_revisions%rowtype;
begin
  perform tongs._require_pricing_service_role();
  if p_reservation_id is null or v_reason is null then
    raise exception 'invalid customer test authorization closure' using errcode='22023';
  end if;
  select a.* into v_authorization
  from tongs.customer_paid_execution_test_authorization_quotes binding
  join tongs.customer_paid_execution_test_authorizations a
    on a.id=binding.authorization_id
  join tongs.funding_reservations reservation on reservation.quote_id=binding.quote_id
  where reservation.id=p_reservation_id;
  if not found then raise exception 'customer test authorization not found' using errcode='P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended('customer-paid-test-authorization:'||v_authorization.id::text,0));
  select * into v_latest from tongs.customer_paid_execution_test_authorization_revisions
    where authorization_id=v_authorization.id order by revision desc limit 1;
  if v_latest.status='closed' then
    return jsonb_build_object('authorization_id',v_authorization.id,'status','closed','replay',true);
  end if;
  insert into tongs.customer_paid_execution_test_authorization_revisions(
    authorization_id,revision,status,reason,actor_id
  ) values (v_authorization.id,v_latest.revision+1,'closed',v_reason,v_authorization.created_by);
  return jsonb_build_object('authorization_id',v_authorization.id,'status','closed','replay',false,
    'new_reservations_authorized',false,'reconciliation_preserved',true);
end $$;

create or replace function tongs.close_customer_paid_execution_test_authorization(
  p_authorization_id uuid,
  p_operator_user_id uuid,
  p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_reason text:=nullif(btrim(coalesce(p_reason,'')), '');
  v_authorization tongs.customer_paid_execution_test_authorizations%rowtype;
  v_latest tongs.customer_paid_execution_test_authorization_revisions%rowtype;
begin
  perform tongs._require_pricing_service_role();
  if p_authorization_id is null or p_operator_user_id is null or v_reason is null
     or not tongs.is_platform_operator(p_operator_user_id) then
    raise exception 'invalid customer test authorization closure' using errcode='22023';
  end if;
  select * into v_authorization
  from tongs.customer_paid_execution_test_authorizations
  where id=p_authorization_id;
  if not found then raise exception 'customer test authorization not found' using errcode='P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended('customer-paid-test-authorization:'||v_authorization.id::text,0));
  select * into v_latest from tongs.customer_paid_execution_test_authorization_revisions
    where authorization_id=v_authorization.id order by revision desc limit 1;
  if v_latest.status='closed' then
    return jsonb_build_object('authorization_id',v_authorization.id,'status','closed','replay',true);
  end if;
  insert into tongs.customer_paid_execution_test_authorization_revisions(
    authorization_id,revision,status,reason,actor_id
  ) values (v_authorization.id,v_latest.revision+1,'closed',v_reason,p_operator_user_id);
  return jsonb_build_object('authorization_id',v_authorization.id,'status','closed','replay',false,
    'new_reservations_authorized',false,'reconciliation_preserved',true);
end $$;

create or replace function tongs.read_customer_paid_execution_test_authorizations(p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid();
begin
  if v_actor is null or not tongs.is_platform_operator(v_actor) then
    raise exception 'platform operator required' using errcode='42501';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc)
    from (
      select a.id,a.user_id,a.workspace_id,
        a.route_code,a.provider,a.model,
        a.pricing_revision_id,a.cost_policy_revision_id,
        a.maximum_operation_count,a.maximum_customer_charge_micros,
        a.authorization_expires_at,latest.status,
        binding.quote_id,reservation.id as reservation_id,
        case when reservation.id is null then null else tongs._funding_reservation_state(reservation.id) end as reservation_state,
        a.created_at
      from tongs.customer_paid_execution_test_authorizations a
      join lateral (
        select revision.status from tongs.customer_paid_execution_test_authorization_revisions revision
        where revision.authorization_id=a.id order by revision.revision desc limit 1
      ) latest on true
      left join tongs.customer_paid_execution_test_authorization_quotes binding
        on binding.authorization_id=a.id
      left join tongs.funding_reservations reservation on reservation.quote_id=binding.quote_id
      order by a.created_at desc limit greatest(1,least(coalesce(p_limit,50),250))
    ) row_data
  ),'[]'::jsonb);
end $$;

-- The global customer-settlement switch may remain enabled for reconciliation,
-- so every new customer-funded reservation is independently scoped by the trigger above.
-- Existing Runway quote responses must not suggest general customer activation.
alter function tongs.create_customer_runway_quote(uuid,uuid,text,uuid,text,text,integer,text,timestamptz)
  rename to _create_customer_runway_quote_before_customer_test_scope;

create or replace function tongs.create_customer_runway_quote(
  p_quote_id uuid,p_user_id uuid,p_operation_id text,p_workspace_id uuid,
  p_operation_fingerprint text,p_model text,p_duration_seconds integer,p_ratio text,p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_result jsonb;
begin
  perform tongs._require_pricing_service_role();
  v_result:=tongs._create_customer_runway_quote_before_customer_test_scope(
    p_quote_id,p_user_id,p_operation_id,p_workspace_id,p_operation_fingerprint,
    p_model,p_duration_seconds,p_ratio,p_expires_at
  );
  return jsonb_set(v_result,'{customer_spending_enabled}','false'::jsonb,true)
    || jsonb_build_object('activation_scope','not_authorized_for_this_test');
end $$;

revoke all on function tongs.activate_customer_hearth_chat_luna_test(uuid,uuid,uuid,uuid,uuid,uuid,uuid,timestamptz,text) from public,anon,authenticated;
revoke all on function tongs.create_customer_hearth_chat_quote(uuid,uuid,text,uuid,text,timestamptz) from public,anon,authenticated;
revoke all on function tongs.reserve_customer_hearth_chat_quote(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function tongs.close_customer_paid_execution_test_authorization_for_reservation(uuid,text) from public,anon,authenticated;
revoke all on function tongs.close_customer_paid_execution_test_authorization(uuid,uuid,text) from public,anon,authenticated;
grant execute on function tongs.activate_customer_hearth_chat_luna_test(uuid,uuid,uuid,uuid,uuid,uuid,uuid,timestamptz,text) to service_role;
grant execute on function tongs.create_customer_hearth_chat_quote(uuid,uuid,text,uuid,text,timestamptz) to service_role;
grant execute on function tongs.reserve_customer_hearth_chat_quote(uuid,uuid,text,text) to service_role;
grant execute on function tongs.close_customer_paid_execution_test_authorization_for_reservation(uuid,text) to service_role;
grant execute on function tongs.close_customer_paid_execution_test_authorization(uuid,uuid,text) to service_role;
revoke all on function tongs.read_customer_paid_execution_test_authorizations(integer) from public,anon;
grant execute on function tongs.read_customer_paid_execution_test_authorizations(integer) to authenticated,service_role;

comment on table tongs.customer_paid_execution_test_authorizations is
  'Server-owned, single-operation customer canary scopes. They never grant owner-budget access or general route activation.';

notify pgrst,'reload schema';
commit;
