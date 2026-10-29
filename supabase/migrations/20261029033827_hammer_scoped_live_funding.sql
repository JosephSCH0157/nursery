-- One-customer Live funding lane for the certified first Hammer transcription.
--
-- The global Forge financial environment remains Test. This migration creates
-- no authority, checkout, deposit, quote, reservation, or provider attempt.
-- A later owner-authorized service operation must bind one exact activation,
-- and the ordinary signed Stripe webhook must still establish economically
-- backed Live funds and processor-fee evidence.
begin;

do $$ begin
  if not exists(select 1 from supabase_migrations.schema_migrations where version='20261029004958') then
    raise exception '20261029004958 must precede Hammer scoped Live funding';
  end if;
end $$;

create table tongs.hammer_scoped_live_funding_authorities (
  id uuid primary key,
  activation_authority_id uuid not null unique
    references tongs.hammer_first_transcription_activation_authorities(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
  workpiece_id uuid not null references tongs.episodes(id) on delete restrict,
  route_code text not null check (route_code='hammer.transcript_prep'),
  financial_environment text not null check (financial_environment='live'),
  live_price_id text not null check (live_price_id='price_1THR9p1OSG3CCNl89Pm2J7BR'),
  maximum_checkout_sessions smallint not null check (maximum_checkout_sessions=1),
  gross_amount_micros bigint not null check (gross_amount_micros=10000000),
  credit_units bigint not null check (credit_units=2000),
  valid_from timestamptz not null,
  valid_until timestamptz not null check (valid_until>valid_from),
  status text not null check (status in ('active','closed')),
  reason text not null check (length(btrim(reason)) between 8 and 500),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(user_id,workspace_id,workpiece_id,route_code)
);

create table tongs.hammer_scoped_live_checkout_claims (
  id uuid primary key,
  funding_authority_id uuid not null unique
    references tongs.hammer_scoped_live_funding_authorities(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  live_price_id text not null check (live_price_id='price_1THR9p1OSG3CCNl89Pm2J7BR'),
  stripe_session_id text unique,
  claimed_at timestamptz not null default clock_timestamp(),
  session_recorded_at timestamptz,
  check ((stripe_session_id is null)=(session_recorded_at is null))
);

alter table tongs.hammer_scoped_live_funding_authorities enable row level security;
alter table tongs.hammer_scoped_live_funding_authorities force row level security;
alter table tongs.hammer_scoped_live_checkout_claims enable row level security;
alter table tongs.hammer_scoped_live_checkout_claims force row level security;

revoke all on tongs.hammer_scoped_live_funding_authorities from public,anon,authenticated,service_role;
revoke all on tongs.hammer_scoped_live_checkout_claims from public,anon,authenticated,service_role;

create trigger hammer_scoped_live_funding_authorities_immutable
before update or delete on tongs.hammer_scoped_live_funding_authorities
for each row execute function tongs._reject_accounting_mutation();

create trigger hammer_scoped_live_checkout_claims_no_delete
before delete on tongs.hammer_scoped_live_checkout_claims
for each row execute function tongs._reject_accounting_mutation();

create or replace function tongs.install_hammer_scoped_live_funding_authority(
  p_authority_id uuid,p_activation_authority_id uuid,p_actor_id uuid,
  p_valid_from timestamptz,p_valid_until timestamptz,p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare activation tongs.hammer_first_transcription_activation_authorities%rowtype;
begin
  perform tongs._require_pricing_service_role();
  if not tongs.is_platform_operator(p_actor_id) then
    raise exception 'platform operator required' using errcode='42501';
  end if;
  select * into activation from tongs.hammer_first_transcription_activation_authorities
  where id=p_activation_authority_id;
  if activation.id is null or activation.financial_environment<>'live'
     or activation.user_id<>'71daf61b-57b3-4e5f-a8c8-64befecb5950'::uuid
     or activation.workspace_id<>'cc5478ff-37be-403e-824c-467fa7da061e'::uuid
     or activation.workpiece_id<>'21d16d6a-905b-491e-8761-028789612ae5'::uuid
     or p_valid_from<activation.valid_from or p_valid_until>activation.valid_until
     or p_valid_until<=p_valid_from or length(btrim(coalesce(p_reason,''))) not between 8 and 500
  then raise exception 'exact bounded Live Hammer activation required' using errcode='42501'; end if;
  insert into tongs.hammer_scoped_live_funding_authorities(
    id,activation_authority_id,user_id,workspace_id,workpiece_id,route_code,
    financial_environment,live_price_id,maximum_checkout_sessions,gross_amount_micros,
    credit_units,valid_from,valid_until,status,reason,created_by
  ) values(
    p_authority_id,activation.id,activation.user_id,activation.workspace_id,
    activation.workpiece_id,'hammer.transcript_prep','live',
    'price_1THR9p1OSG3CCNl89Pm2J7BR',1,10000000,2000,
    p_valid_from,p_valid_until,'active',btrim(p_reason),p_actor_id
  );
  return jsonb_build_object('funding_authority_id',p_authority_id,
    'financial_environment','live','maximum_checkout_sessions',1,'execution_authorized',false);
end $$;

create or replace function tongs.claim_hammer_scoped_live_checkout(
  p_claim_id uuid,p_user_id uuid,p_workspace_id uuid,p_workpiece_id uuid,
  p_route_code text,p_live_price_id text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare authority tongs.hammer_scoped_live_funding_authorities%rowtype;
begin
  perform tongs._require_pricing_service_role();
  perform pg_advisory_xact_lock(hashtextextended('hammer-live-checkout:'||p_user_id::text,0));
  select funding.* into authority from tongs.hammer_scoped_live_funding_authorities funding
  where funding.user_id=p_user_id and funding.workspace_id=p_workspace_id and funding.workpiece_id=p_workpiece_id
    and funding.route_code=p_route_code and funding.financial_environment='live'
    and funding.live_price_id=p_live_price_id and funding.status='active'
    and funding.valid_from<=clock_timestamp() and funding.valid_until>clock_timestamp()
    and not exists(select 1 from tongs.hammer_scoped_live_checkout_claims c where c.funding_authority_id=funding.id)
  order by funding.created_at desc limit 1;
  if authority.id is null then raise exception 'scoped Live Hammer checkout is not authorized' using errcode='42501'; end if;
  insert into tongs.hammer_scoped_live_checkout_claims(id,funding_authority_id,user_id,live_price_id)
  values(p_claim_id,authority.id,p_user_id,p_live_price_id);
  return jsonb_build_object('claim_id',p_claim_id,'funding_authority_id',authority.id,
    'financial_environment','live','price_id',authority.live_price_id,
    'gross_amount_micros',authority.gross_amount_micros,'credit_units',authority.credit_units);
end $$;

create or replace function tongs.record_hammer_scoped_live_checkout_session(
  p_claim_id uuid,p_user_id uuid,p_stripe_session_id text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
  perform tongs._require_pricing_service_role();
  if nullif(btrim(coalesce(p_stripe_session_id,'')),'') is null then
    raise exception 'Stripe session id is required' using errcode='22023';
  end if;
  update tongs.hammer_scoped_live_checkout_claims
  set stripe_session_id=btrim(p_stripe_session_id),session_recorded_at=clock_timestamp()
  where id=p_claim_id and user_id=p_user_id and stripe_session_id is null;
  if not found then raise exception 'unrecorded scoped Live checkout claim required' using errcode='42501'; end if;
  return jsonb_build_object('claim_id',p_claim_id,'stripe_session_id',btrim(p_stripe_session_id));
end $$;

-- Quote environment is scoped only after the signed webhook has recorded the
-- exact Live deposit and processor-fee evidence for the claimed Checkout.
create or replace function tongs._stamp_spending_quote_environment()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare v_environment text;
begin
  if new.tool='hammer.transcript_prep' then
    select 'live' into v_environment
    from tongs.hammer_scoped_live_funding_authorities funding
    join tongs.hammer_first_transcription_activation_authorities activation
      on activation.id=funding.activation_authority_id
    join tongs.hammer_scoped_live_checkout_claims claim
      on claim.funding_authority_id=funding.id and claim.stripe_session_id is not null
    join tongs.customer_deposits deposit
      on deposit.stripe_mode='live' and deposit.stripe_session_id=claim.stripe_session_id
      and deposit.user_id=funding.user_id and deposit.gross_amount_micros=funding.gross_amount_micros
      and deposit.credit_units=funding.credit_units
    join tongs.customer_deposit_processor_fees fee on fee.deposit_id=deposit.id
    where funding.user_id=new.user_id and funding.workspace_id=new.workspace_id
      and funding.status='active' and funding.valid_from<=clock_timestamp()
      and funding.valid_until>clock_timestamp() and activation.financial_environment='live'
      and not exists(select 1 from tongs.hammer_first_transcription_activation_consumptions consumed
        where consumed.activation_authority_id=activation.id)
    order by funding.created_at desc limit 1;
  end if;
  v_environment:=coalesce(v_environment,tongs._current_financial_environment());
  if v_environment not in('test','live') then
    raise exception 'trusted financial runtime environment is unavailable' using errcode='42501';
  end if;
  new.financial_environment:=v_environment;
  return new;
end $$;

create or replace function tongs.create_hammer_first_transcription_quote(
  p_quote_id uuid,p_operation_uuid uuid,p_user_id uuid,p_workspace_id uuid,p_workpiece_id uuid,
  p_canonical_recording_id uuid,p_recording_revision_id uuid,p_request_fingerprint text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare authority tongs.hammer_first_transcription_activation_authorities%rowtype; quote jsonb;
  funding jsonb; quote_row tongs.customer_spending_quotes%rowtype; operation_text text;
begin
  perform tongs._require_pricing_service_role();
  select * into authority from tongs.hammer_first_transcription_activation_authorities a
    where a.user_id=p_user_id and a.workspace_id=p_workspace_id and a.workpiece_id=p_workpiece_id
      and a.canonical_recording_id=p_canonical_recording_id and a.recording_revision_id=p_recording_revision_id
      and clock_timestamp()>=a.valid_from and clock_timestamp()<a.valid_until
      and not exists(select 1 from tongs.hammer_first_transcription_activation_consumptions c where c.activation_authority_id=a.id);
  if authority.id is null then raise exception 'paid_submissions_halted' using errcode='42501'; end if;
  operation_text:='hammer-assemblyai:'||p_operation_uuid::text;
  quote:=tongs.create_shadow_spending_quote(p_quote_id,p_user_id,operation_text,'hammer.transcript_prep',p_workspace_id,
    authority.pricing_revision_id,p_request_fingerprint,
    jsonb_build_array(jsonb_build_object('component','assemblyai_transcription','provider_label','AssemblyAI Universal-3.5 Pro with speaker labels','credential_source','forge')),
    least(authority.valid_until,clock_timestamp()+interval '15 minutes'));
  insert into tongs.hammer_first_transcription_quote_bindings(quote_id,activation_authority_id,operation_uuid,operation_id,user_id,request_fingerprint)
  values(p_quote_id,authority.id,p_operation_uuid,operation_text,p_user_id,p_request_fingerprint) on conflict(quote_id) do nothing;
  select * into quote_row from tongs.customer_spending_quotes where id=p_quote_id;
  if quote_row.financial_environment<>authority.financial_environment then
    raise exception 'scoped Hammer quote environment mismatch' using errcode='42501';
  end if;
  funding:=tongs._select_customer_funding_for_quote(p_quote_id);
  return jsonb_build_object('quote_id',quote_row.id,'operation_id',operation_text,
    'quote_hash',quote_row.quote_hash,'request_fingerprint',quote_row.request_fingerprint,
    'customer_credit_units',quote_row.customer_credit_units,'maximum_customer_charge_micros',quote_row.normal_maximum_charge_micros,
    'funding_eligible',coalesce((funding->>'eligible')::boolean,false),'funding_label',coalesce(funding->>'customer_label','No verified eligible funds'),
    'funding_environment',quote_row.financial_environment,
    'expires_at',quote_row.expires_at,'accepted',exists(select 1 from tongs.customer_spending_quote_acceptances where quote_id=quote_row.id));
end $$;

-- Extend the authoritative reservation trigger with one Hammer-specific Live
-- branch. Every existing OpenAI/Test/owner branch remains byte-equivalent.
create or replace function tongs._stamp_and_authorize_funding_reservation()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare
  quote_row tongs.customer_spending_quotes%rowtype;
  source_environment text;
  quote_binding tongs.openai_text_customer_quote_bindings%rowtype;
  scope_auth tongs.customer_paid_execution_scope_authorizations%rowtype;
  activation tongs.owner_paid_execution_canary_activation_revisions%rowtype;
  hammer_binding tongs.hammer_first_transcription_quote_bindings%rowtype;
  hammer_activation tongs.hammer_first_transcription_activation_authorities%rowtype;
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

  select * into hammer_binding from tongs.hammer_first_transcription_quote_bindings where quote_id=new.quote_id;
  if found then
    select * into hammer_activation from tongs.hammer_first_transcription_activation_authorities
    where id=hammer_binding.activation_authority_id;
    if new.funding_source_type<>'customer_deposit' or source_environment<>'live'
       or quote_row.financial_environment<>'live' or hammer_activation.financial_environment<>'live'
       or new.reserved_customer_charge_micros>60000 or new.reserved_credit_units>12
       or new.reserved_wholesale_spend_micros>44589
       or not exists(
         select 1 from tongs.hammer_scoped_live_funding_authorities funding
         join tongs.hammer_scoped_live_checkout_claims claim on claim.funding_authority_id=funding.id
         join tongs.customer_deposits deposit on deposit.id=new.funding_source_id
           and deposit.stripe_session_id=claim.stripe_session_id and deposit.stripe_mode='live'
           and deposit.user_id=funding.user_id and deposit.gross_amount_micros=funding.gross_amount_micros
           and deposit.credit_units=funding.credit_units
         join tongs.customer_deposit_processor_fees fee on fee.deposit_id=deposit.id
         where funding.activation_authority_id=hammer_activation.id and funding.user_id=new.user_id
           and funding.status='active' and funding.valid_from<=clock_timestamp()
           and funding.valid_until>clock_timestamp())
    then raise exception 'exact economically backed Hammer Live funding required' using errcode='42501'; end if;
    perform pg_advisory_xact_lock(hashtextextended('hammer-live-reservation:'||hammer_activation.id::text,0));
    select count(*) into prior_count from tongs.funding_reservations reservation
      join tongs.hammer_first_transcription_quote_bindings binding on binding.quote_id=reservation.quote_id
      where binding.activation_authority_id=hammer_activation.id;
    if prior_count>=1 then raise exception 'Hammer Live funding operation limit reached' using errcode='P0001'; end if;
    return new;
  end if;

  if new.funding_source_type='owner_budget' and source_environment='test' then
    select * into activation from tongs._active_owner_paid_execution_canary_for_scope(scope_auth.id,new.funding_source_id);
    if activation.id is null
       or new.reserved_wholesale_spend_micros>scope_auth.maximum_wholesale_exposure_micros
       or new.reserved_customer_charge_micros<>0 or new.reserved_credit_units<>0 then
      raise exception 'exact owner canary funding authority required' using errcode='42501';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('paid-scope:'||scope_auth.id::text,0));
    select count(*) into prior_count from tongs.funding_reservations where rollout_authorization_id=scope_auth.id;
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

do $$ declare signature regprocedure; begin
  foreach signature in array array[
    'tongs.install_hammer_scoped_live_funding_authority(uuid,uuid,uuid,timestamptz,timestamptz,text)'::regprocedure,
    'tongs.claim_hammer_scoped_live_checkout(uuid,uuid,uuid,uuid,text,text)'::regprocedure,
    'tongs.record_hammer_scoped_live_checkout_session(uuid,uuid,text)'::regprocedure
  ] loop
    execute format('revoke all on function %s from public,anon,authenticated',signature);
    execute format('grant execute on function %s to service_role',signature);
  end loop;
end $$;

do $$ begin
  if exists(select 1 from tongs.hammer_scoped_live_funding_authorities)
     or exists(select 1 from tongs.hammer_scoped_live_checkout_claims)
  then raise exception 'scoped Live funding migration must remain inactive'; end if;
  if tongs._current_financial_environment()<>'test' then
    raise exception 'scoped Live funding migration must preserve global Test'; end if;
end $$;

comment on table tongs.hammer_scoped_live_funding_authorities is
  'Private one-customer Live checkout authority. It does not grant credits; only the signed paid webhook may create a deposit.';

notify pgrst,'reload schema';
commit;
