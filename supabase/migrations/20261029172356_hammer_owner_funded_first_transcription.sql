begin;

-- One exact owner-sponsored certification lane. This is not a customer balance,
-- deposit, allowance, or Test credit grant. Applying this migration creates no
-- authority, budget, quote, reservation, operation, or provider attempt.
create table tongs.hammer_owner_funded_transcription_authorities (
  id uuid primary key,
  activation_authority_id uuid not null unique
    references tongs.hammer_first_transcription_activation_authorities(id) on delete restrict,
  owner_budget_id uuid not null unique
    references tongs.owner_operating_budgets(id) on delete restrict,
  sponsor_operator_id uuid not null references auth.users(id) on delete restrict,
  beneficiary_user_id uuid not null references auth.users(id) on delete restrict,
  workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
  workpiece_id uuid not null references tongs.episodes(id) on delete restrict,
  canonical_recording_id uuid not null references tongs.canonical_recordings(id) on delete restrict,
  recording_revision_id uuid not null references tongs.recording_revisions(id) on delete restrict,
  completion_id uuid not null references tongs.anvil_recording_completion_requests(id) on delete restrict,
  media_sha256 text not null check (media_sha256 ~ '^[0-9a-f]{64}$'),
  verified_duration_ms bigint not null check (verified_duration_ms = 603848),
  supplier_ceiling_micros bigint not null check (supplier_ceiling_micros = 38589),
  supporting_ceiling_micros bigint not null check (supporting_ceiling_micros = 6000),
  maximum_wholesale_exposure_micros bigint not null check (maximum_wholesale_exposure_micros = 44589),
  reference_customer_credit_units bigint not null check (reference_customer_credit_units = 12),
  customer_payment_micros bigint not null check (customer_payment_micros = 0),
  customer_credit_units bigint not null check (customer_credit_units = 0),
  maximum_operations smallint not null check (maximum_operations = 1),
  maximum_provider_attempts smallint not null check (maximum_provider_attempts = 1),
  automatic_retries smallint not null check (automatic_retries = 0),
  valid_from timestamptz not null,
  valid_until timestamptz not null check (valid_until > valid_from),
  status text not null check (status in ('active','retired')),
  reason text not null check (length(btrim(reason)) between 8 and 500),
  created_at timestamptz not null default now(),
  check (maximum_wholesale_exposure_micros = supplier_ceiling_micros + supporting_ceiling_micros)
);

alter table tongs.hammer_owner_funded_transcription_authorities enable row level security;
alter table tongs.hammer_owner_funded_transcription_authorities force row level security;
revoke all on table tongs.hammer_owner_funded_transcription_authorities
  from public, anon, authenticated, service_role;
grant select, insert on table tongs.hammer_owner_funded_transcription_authorities to service_role;

create or replace function tongs._active_hammer_owner_sponsorship_for_quote(p_quote_id uuid)
returns tongs.hammer_owner_funded_transcription_authorities
language sql stable security definer set search_path=pg_catalog as $$
  select sponsorship
  from tongs.hammer_first_transcription_quote_bindings binding
  join tongs.hammer_owner_funded_transcription_authorities sponsorship
    on sponsorship.activation_authority_id=binding.activation_authority_id
  join tongs.owner_operating_budgets budget on budget.id=sponsorship.owner_budget_id
  join lateral (
    select revision.* from tongs.owner_operating_budget_revisions revision
    where revision.budget_id=budget.id order by revision.revision desc limit 1
  ) latest on true
  where binding.quote_id=p_quote_id
    and sponsorship.status='active'
    and sponsorship.valid_from<=clock_timestamp()
    and sponsorship.valid_until>clock_timestamp()
    and budget.period_start<=clock_timestamp() and budget.period_end>clock_timestamp()
    and latest.status='active'
    and latest.maximum_amount_micros=sponsorship.maximum_wholesale_exposure_micros
    and not exists (
      select 1 from tongs.hammer_first_transcription_activation_consumptions consumed
      where consumed.activation_authority_id=sponsorship.activation_authority_id
    )
  limit 1
$$;

create or replace function tongs.install_hammer_owner_funded_first_transcription_authority(
  p_authority_id uuid,
  p_budget_id uuid,
  p_activation_authority_id uuid,
  p_operator_id uuid,
  p_valid_from timestamptz,
  p_valid_until timestamptz,
  p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  activation tongs.hammer_first_transcription_activation_authorities%rowtype;
  existing tongs.hammer_owner_funded_transcription_authorities%rowtype;
  prior_sub text:=current_setting('request.jwt.claim.sub',true);
begin
  perform tongs._require_pricing_service_role();
  if p_authority_id is null or p_budget_id is null or p_operator_id is null
     or not tongs.is_platform_operator(p_operator_id)
     or p_valid_from is null or p_valid_until<=p_valid_from
     or p_valid_until>p_valid_from+interval '24 hours'
     or length(btrim(coalesce(p_reason,''))) not between 8 and 500
  then raise exception 'invalid bounded Hammer owner sponsorship' using errcode='22023'; end if;
  select * into existing from tongs.hammer_owner_funded_transcription_authorities where id=p_authority_id;
  if found then
    if existing.owner_budget_id<>p_budget_id
       or existing.activation_authority_id<>p_activation_authority_id
    then raise exception 'Hammer owner sponsorship replay conflict' using errcode='23505'; end if;
    return to_jsonb(existing)||jsonb_build_object('replay',true,'execution_authorized',false);
  end if;
  select * into activation from tongs.hammer_first_transcription_activation_authorities
    where id=p_activation_authority_id for update;
  if not found
     or activation.user_id<>'71daf61b-57b3-4e5f-a8c8-64befecb5950'::uuid
     or activation.workspace_id<>'cc5478ff-37be-403e-824c-467fa7da061e'::uuid
     or activation.workpiece_id<>'21d16d6a-905b-491e-8761-028789612ae5'::uuid
     or activation.canonical_recording_id<>'4cc846e3-187c-46d9-8733-e7402488236c'::uuid
     or activation.recording_revision_id<>'9c991aa7-f551-4f03-a4d6-41eb40ef81ec'::uuid
     or activation.completion_id<>'bf67d649-1bc2-44ba-9a33-783b3ab523ea'::uuid
     or activation.media_sha256<>'595ea9d8abc571a5e92be6eec0c5e5c23e82a6a6956a598dc391c82d80224e24'
     or activation.verified_duration_ms<>603848
     or activation.supplier_ceiling_micros<>38589
     or activation.supporting_cost_ceiling_micros<>6000
     or activation.complete_wholesale_ceiling_micros<>44589
     or activation.customer_credit_units<>12
     or activation.maximum_customer_charge_micros<>60000
     or activation.maximum_provider_attempts<>1
     or activation.maximum_concurrency<>1
     or activation.automatic_retries<>0
     or p_valid_until>least(activation.valid_until,
       (select capacity.expires_at from tongs.hammer_first_transcription_capacity_authorities capacity
        where capacity.id=activation.capacity_authority_id),
       (select provider.expires_at from tongs.hammer_transcription_provider_authorities provider
        where provider.id=activation.provider_authority_id))
  then raise exception 'exact certified Brad activation and current evidence required' using errcode='42501'; end if;
  if exists(select 1 from tongs.owner_operating_budgets where id=p_budget_id) then
    raise exception 'owner budget id already exists' using errcode='23505'; end if;
  perform set_config('request.jwt.claim.sub',p_operator_id::text,true);
  perform tongs.create_owner_testing_budget_draft(
    p_budget_id,p_operator_id,p_operator_id,'test',activation.workspace_id,
    'assemblyai','hammer.transcript_prep',
    (select lower(policy.sku) from tongs.private_pricing_revisions revision
      join tongs.private_pricing_policies policy on policy.id=revision.policy_id
      where revision.id=activation.pricing_revision_id),
    'USD',p_valid_from,p_valid_until,btrim(p_reason));
  perform tongs.revise_owner_operating_budget(
    p_budget_id,'active',44589,btrim(p_reason));
  perform set_config('request.jwt.claim.sub',coalesce(prior_sub,''),true);
  insert into tongs.hammer_owner_funded_transcription_authorities(
    id,activation_authority_id,owner_budget_id,sponsor_operator_id,beneficiary_user_id,
    workspace_id,workpiece_id,canonical_recording_id,recording_revision_id,completion_id,
    media_sha256,verified_duration_ms,supplier_ceiling_micros,supporting_ceiling_micros,
    maximum_wholesale_exposure_micros,reference_customer_credit_units,customer_payment_micros,
    customer_credit_units,maximum_operations,maximum_provider_attempts,automatic_retries,
    valid_from,valid_until,status,reason
  ) values(
    p_authority_id,p_activation_authority_id,p_budget_id,p_operator_id,activation.user_id,
    activation.workspace_id,activation.workpiece_id,activation.canonical_recording_id,
    activation.recording_revision_id,activation.completion_id,activation.media_sha256,
    activation.verified_duration_ms,38589,6000,44589,12,0,0,1,1,0,
    p_valid_from,p_valid_until,'active',btrim(p_reason));
  return jsonb_build_object('authority_id',p_authority_id,'owner_budget_id',p_budget_id,
    'beneficiary_user_id',activation.user_id,'customer_payment_micros',0,
    'customer_credit_units',0,'reference_customer_credit_units',12,
    'maximum_wholesale_exposure_micros',44589,'execution_authorized',false,'replay',false);
exception when others then
  perform set_config('request.jwt.claim.sub',coalesce(prior_sub,''),true);
  raise;
end $$;

-- Keep every existing owner-budget rule. The only additional admissible identity
-- is Brad as beneficiary of the exact service-installed sponsorship above.
create or replace function tongs._validate_owner_budget_reservation()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_budget tongs.owner_operating_budgets%rowtype;
  v_revision tongs.owner_operating_budget_revisions%rowtype;
  v_quote tongs.customer_spending_quotes%rowtype;
  v_pricing tongs.private_pricing_revisions%rowtype;
  v_policy tongs.private_pricing_policies%rowtype;
  v_consumed bigint; v_held bigint;
begin
  if new.funding_source_type<>'owner_budget' then return new; end if;
  select * into v_budget from tongs.owner_operating_budgets where id=new.funding_source_id for update;
  select * into v_revision from tongs.owner_operating_budget_revisions
    where budget_id=new.funding_source_id order by revision desc limit 1;
  select * into v_quote from tongs.customer_spending_quotes where id=new.quote_id;
  select * into v_pricing from tongs.private_pricing_revisions where id=v_quote.pricing_revision_id;
  select * into v_policy from tongs.private_pricing_policies where id=v_pricing.policy_id;
  if v_budget.id is null or v_revision.status<>'active' or v_revision.maximum_amount_micros is null
     or now()<v_budget.period_start or now()>=v_budget.period_end
  then raise exception 'active capped owner operating budget required' using errcode='P0001'; end if;
  if not tongs.is_platform_operator(v_quote.user_id) and not exists(
    select 1 from tongs._active_hammer_owner_sponsorship_for_quote(new.quote_id) sponsorship
    where sponsorship.owner_budget_id=new.funding_source_id
      and sponsorship.beneficiary_user_id=v_quote.user_id
  ) then raise exception 'owner budget requires platform operator or exact sponsored operation identity' using errcode='42501'; end if;
  if v_budget.currency<>new.currency
     or (v_budget.workspace_id is not null and v_budget.workspace_id is distinct from v_quote.workspace_id)
     or (v_budget.provider is not null and lower(v_budget.provider) is distinct from lower(v_policy.provider))
     or (v_budget.route is not null and lower(v_budget.route) is distinct from lower(v_quote.tool))
     or (v_budget.sku is not null and lower(v_budget.sku) is distinct from lower(v_policy.sku))
  then raise exception 'owner budget scope does not cover operation' using errcode='42501'; end if;
  select coalesce(sum(expense_amount_micros),0) into v_consumed
    from tongs.owner_operating_budget_consumptions where budget_id=v_budget.id;
  select coalesce(sum(reservation.reserved_wholesale_spend_micros),0) into v_held
    from tongs.funding_reservations reservation
    where reservation.funding_source_type='owner_budget'
      and reservation.funding_source_id=v_budget.id
      and tongs._funding_reservation_state(reservation.id) not in ('settled','released');
  if v_consumed+v_held+new.reserved_wholesale_spend_micros>v_revision.maximum_amount_micros
  then raise exception 'insufficient owner operating budget' using errcode='P0001'; end if;
  if new.reserved_customer_charge_micros<>0 or new.reserved_credit_units<>0
  then raise exception 'owner-funded reservation cannot debit a customer' using errcode='23514'; end if;
  return new;
end $$;

-- Replace only the Hammer branch of the latest reservation stamp contract. All
-- unrelated customer and OpenAI owner-canary rules are preserved verbatim.
do $$
declare definition text; changed text; old_block text; new_block text;
begin
  select pg_get_functiondef('tongs._stamp_and_authorize_funding_reservation()'::regprocedure) into definition;
  old_block := $block$
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
$block$;
  new_block := $block$
    if new.funding_source_type='owner_budget' and source_environment='owner_internal' then
      if new.reserved_customer_charge_micros<>0 or new.reserved_credit_units<>0
         or new.reserved_wholesale_spend_micros<>44589
         or not exists(
           select 1 from tongs._active_hammer_owner_sponsorship_for_quote(new.quote_id) sponsorship
           where sponsorship.owner_budget_id=new.funding_source_id
             and sponsorship.activation_authority_id=hammer_activation.id
             and sponsorship.beneficiary_user_id=new.user_id)
      then raise exception 'exact owner-sponsored Hammer funding required' using errcode='42501'; end if;
      perform pg_advisory_xact_lock(hashtextextended('hammer-owner-reservation:'||hammer_activation.id::text,0));
      select count(*) into prior_count from tongs.funding_reservations reservation
        join tongs.hammer_first_transcription_quote_bindings binding on binding.quote_id=reservation.quote_id
        where binding.activation_authority_id=hammer_activation.id;
      if prior_count>=1 then raise exception 'Hammer owner-sponsored operation limit reached' using errcode='P0001'; end if;
      return new;
    end if;
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
$block$;
  changed:=replace(definition,old_block,new_block);
  if changed=definition or position('exact owner-sponsored Hammer funding required' in changed)=0
  then raise exception 'Hammer reservation authorization contract changed upstream; explicit review required'; end if;
  execute changed;
end $$;

-- The canonical quote remains the reviewed 12-Credit cost-plus quote. The
-- customer-facing debit is separately and explicitly zero under sponsorship.
create or replace function tongs.create_hammer_first_transcription_quote(
  p_quote_id uuid,p_operation_uuid uuid,p_user_id uuid,p_workspace_id uuid,p_workpiece_id uuid,
  p_canonical_recording_id uuid,p_recording_revision_id uuid,p_request_fingerprint text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare authority tongs.hammer_first_transcription_activation_authorities%rowtype; sponsorship tongs.hammer_owner_funded_transcription_authorities%rowtype;
  quote jsonb; funding jsonb; quote_row tongs.customer_spending_quotes%rowtype; operation_text text;
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
  select * into sponsorship from tongs._active_hammer_owner_sponsorship_for_quote(p_quote_id);
  if sponsorship.id is not null then
    return jsonb_build_object('quote_id',quote_row.id,'operation_id',operation_text,
      'quote_hash',quote_row.quote_hash,'request_fingerprint',quote_row.request_fingerprint,
      'customer_credit_units',0,'maximum_customer_charge_micros',0,
      'reference_customer_credit_units',quote_row.customer_credit_units,
      'reference_customer_charge_micros',quote_row.normal_maximum_charge_micros,
      'funding_eligible',true,'funding_source','owner_budget',
      'funding_label','Owner-sponsored certification; no customer charge',
      'expires_at',least(quote_row.expires_at,sponsorship.valid_until),
      'accepted',exists(select 1 from tongs.customer_spending_quote_acceptances where quote_id=quote_row.id));
  end if;
  funding:=tongs._select_customer_funding_for_quote(p_quote_id);
  return jsonb_build_object('quote_id',quote_row.id,'operation_id',operation_text,
    'quote_hash',quote_row.quote_hash,'request_fingerprint',quote_row.request_fingerprint,
    'customer_credit_units',quote_row.customer_credit_units,'maximum_customer_charge_micros',quote_row.normal_maximum_charge_micros,
    'funding_eligible',coalesce((funding->>'eligible')::boolean,false),'funding_label',coalesce(funding->>'customer_label','No verified eligible funds'),
    'expires_at',quote_row.expires_at,'accepted',exists(select 1 from tongs.customer_spending_quote_acceptances where quote_id=quote_row.id));
end $$;

create or replace function tongs.reserve_hammer_first_transcription_quote(
  p_quote_id uuid,p_reservation_id uuid,p_user_id uuid,p_operation_uuid uuid,
  p_request_fingerprint text,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare binding tongs.hammer_first_transcription_quote_bindings%rowtype; authority tongs.hammer_first_transcription_activation_authorities%rowtype;
  sponsorship tongs.hammer_owner_funded_transcription_authorities%rowtype; quote_row tongs.customer_spending_quotes%rowtype;
  funding jsonb; reserved jsonb; admitted jsonb; hold_id uuid; funding_type text; funding_id uuid; customer_ceiling bigint;
begin
  perform tongs._require_pricing_service_role();
  select * into binding from tongs.hammer_first_transcription_quote_bindings where quote_id=p_quote_id;
  select * into authority from tongs.hammer_first_transcription_activation_authorities where id=binding.activation_authority_id;
  select * into quote_row from tongs.customer_spending_quotes where id=p_quote_id;
  if binding.user_id<>p_user_id or binding.operation_uuid<>p_operation_uuid or binding.request_fingerprint<>p_request_fingerprint
     or quote_row.id is null or not exists(select 1 from tongs.customer_spending_quote_acceptances a where a.quote_id=p_quote_id and a.user_id=p_user_id and a.accepted_quote_hash=quote_row.quote_hash)
     or clock_timestamp()>=authority.valid_until
     or exists(select 1 from tongs.hammer_first_transcription_activation_consumptions c where c.activation_authority_id=authority.id)
  then raise exception 'accepted exact first-transcription quote required' using errcode='42501'; end if;
  select * into sponsorship from tongs._active_hammer_owner_sponsorship_for_quote(p_quote_id);
  if sponsorship.id is not null then
    funding_type:='owner_budget'; funding_id:=sponsorship.owner_budget_id; customer_ceiling:=0;
  else
    funding:=tongs._select_customer_funding_for_quote(p_quote_id);
    if coalesce((funding->>'eligible')::boolean,false) is not true then raise exception 'insufficient verified funding' using errcode='P0001'; end if;
    funding_type:=funding->>'funding_source'; funding_id:=(funding->>'funding_source_id')::uuid;
    customer_ceiling:=quote_row.normal_maximum_charge_micros;
  end if;
  reserved:=tongs.reserve_operation(p_reservation_id,p_quote_id,funding_type,funding_id,p_idempotency_key);
  hold_id:=extensions.uuid_generate_v5(p_reservation_id,'aggregate-exposure');
  admitted:=tongs.reserve_restricted_beta_exposure(hold_id,authority.aggregate_policy_revision_id,'assemblyai.transcription.hammer',
    binding.operation_id,p_user_id,authority.workspace_id,p_request_fingerprint,'universal-3-5-pro:diarization',
    tongs._aggregate_funding_class((select r from tongs.funding_reservations r where r.id=p_reservation_id)),
    p_reservation_id::text,'real','interactive',customer_ceiling,38589,6000,0,0,0,900,
    p_reservation_id::text||':aggregate-reserved');
  if coalesce((admitted->>'authorized')::boolean,false) is not true then
    perform tongs.release_operation(p_reservation_id,p_reservation_id::text||':aggregate-denied-release',coalesce(admitted->>'reason','aggregate_denied'),jsonb_build_object('transmitted',false));
    return jsonb_build_object('provider_execution_authorized',false,'reason',admitted->>'reason');
  end if;
  insert into tongs.paid_operation_aggregate_bindings(reservation_id,hold_id,policy_revision_id,capability_code,provider,operation_id,user_id,workspace_id,request_fingerprint,model_or_sku,funding_source_type,credential_funding,provider_mode,pricing_revision_id,cost_policy_revision_id,customer_funding_ceiling_micros,supplier_exposure_ceiling_micros,supporting_exposure_ceiling_micros)
  values(p_reservation_id,hold_id,authority.aggregate_policy_revision_id,'assemblyai.transcription.hammer','assemblyai',binding.operation_id,p_user_id,authority.workspace_id,p_request_fingerprint,'universal-3-5-pro:diarization',funding_type,'forge','real',authority.pricing_revision_id,null,customer_ceiling,38589,6000);
  perform tongs.bind_inactive_hammer_assemblyai_operation(p_operation_uuid,binding.operation_id,p_request_fingerprint,p_user_id,
    authority.workspace_id,authority.workpiece_id,authority.canonical_recording_id,authority.recording_revision_id,
    authority.provider_authority_id,p_quote_id,p_reservation_id);
  return jsonb_build_object('operation_id',p_operation_uuid,'reservation_id',p_reservation_id,
    'funding_source',funding_type,'customer_credit_units',0,'customer_charge_micros',0,
    'execution_authorized',false,'replay',coalesce((reserved->>'replay')::boolean,false));
end $$;

-- Adapt the existing exact binder without relaxing source, quote, aggregate, or
-- arithmetic checks. Owner sponsorship changes only funding kind and customer debit.
do $binder$
declare definition text; changed text;
begin
  select pg_get_functiondef('tongs.bind_inactive_hammer_assemblyai_operation(uuid,text,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid)'::regprocedure) into definition;
  changed:=replace(definition,
    $$or reservation.funding_source_type not in ('customer_deposit','paid_allowance')$$,
    $$or reservation.funding_source_type not in ('customer_deposit','paid_allowance','owner_budget')$$);
  changed:=replace(changed,
    $$or reservation.reserved_customer_charge_micros<>quote.normal_maximum_charge_micros
     or reservation.reserved_credit_units<>quote.customer_credit_units$$,
    $$or (reservation.funding_source_type<>'owner_budget' and
       (reservation.reserved_customer_charge_micros<>quote.normal_maximum_charge_micros
        or reservation.reserved_credit_units<>quote.customer_credit_units))
     or (reservation.funding_source_type='owner_budget' and
       (reservation.reserved_customer_charge_micros<>0 or reservation.reserved_credit_units<>0
        or not exists(select 1 from tongs._active_hammer_owner_sponsorship_for_quote(quote.id) sponsorship
          where sponsorship.owner_budget_id=reservation.funding_source_id)))$$);
  changed:=replace(changed,
    $$or aggregate_binding.customer_funding_ceiling_micros<>quote.normal_maximum_charge_micros$$,
    $$or aggregate_binding.customer_funding_ceiling_micros<>reservation.reserved_customer_charge_micros$$);
  changed:=replace(changed,
    $$quote.normal_maximum_charge_micros,supplier_ceiling,supporting_ceiling,quote.full_cost_ceiling_micros,$$,
    $$reservation.reserved_customer_charge_micros,supplier_ceiling,supporting_ceiling,quote.full_cost_ceiling_micros,$$);
  if changed=definition or position('funding_source_type=''owner_budget''' in changed)=0
  then raise exception 'Hammer operation binder changed upstream; explicit review required'; end if;
  execute changed;
end $binder$;

-- Existing table metadata called this field a customer charge and required it to
-- be positive. Zero is valid only because the binder above proves owner_budget.
alter table tongs.hammer_transcription_operations
  drop constraint if exists hammer_transcription_operations_accepted_customer_charge_micros_check;
alter table tongs.hammer_transcription_operations
  add constraint hammer_transcription_operations_accepted_customer_charge_micros_check
  check (accepted_customer_charge_micros>=0);

create or replace function tongs.authorize_hammer_first_transcription_attempt(
  p_operation_id uuid,p_attempt_id uuid,p_attempt_key text,p_request_sha256 text,p_capacity_evidence jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare operation tongs.hammer_transcription_operations%rowtype; binding tongs.hammer_first_transcription_quote_bindings%rowtype;
  authority tongs.hammer_first_transcription_activation_authorities%rowtype; capacity tongs.hammer_first_transcription_capacity_authorities%rowtype;
  reservation tongs.funding_reservations%rowtype; aggregate_result jsonb; funding_result jsonb;
begin
  perform tongs._require_pricing_service_role(); perform pg_advisory_xact_lock(hashtextextended('hammer-first-transcription',0));
  select * into operation from tongs.hammer_transcription_operations where id=p_operation_id for update;
  select * into reservation from tongs.funding_reservations where id=operation.reservation_id;
  select * into binding from tongs.hammer_first_transcription_quote_bindings where quote_id=operation.quote_id;
  select * into authority from tongs.hammer_first_transcription_activation_authorities where id=binding.activation_authority_id;
  select * into capacity from tongs.hammer_first_transcription_capacity_authorities where id=authority.capacity_authority_id;
  if operation.id is null or operation.state<>'reserved' or operation.execution_authorized
     or clock_timestamp()>=least(authority.valid_until,capacity.expires_at)
     or p_capacity_evidence->>'evidenceSha256'<>capacity.evidence_sha256
     or exists(select 1 from tongs.hammer_first_transcription_activation_consumptions c where c.activation_authority_id=authority.id)
  then return jsonb_build_object('provider_execution_authorized',false,'reason','halt_new'); end if;
  if reservation.funding_source_type='owner_budget' and not exists(
    select 1 from tongs._active_hammer_owner_sponsorship_for_quote(operation.quote_id) sponsorship
    where sponsorship.owner_budget_id=reservation.funding_source_id
  ) then return jsonb_build_object('provider_execution_authorized',false,'reason','owner_sponsorship_unavailable'); end if;
  if operation.financial_environment='test' and reservation.funding_environment='test' then
    return jsonb_build_object('provider_execution_authorized',false,'reason','test_funding_real_provider_forbidden');
  end if;
  aggregate_result:=tongs.begin_paid_operation_aggregate_attempt(operation.reservation_id,p_attempt_key||':aggregate',1,'interactive');
  if coalesce((aggregate_result->>'authorized')::boolean,false) is not true then
    return jsonb_build_object('provider_execution_authorized',false,'reason',coalesce(aggregate_result->>'reason','aggregate_denied'));
  end if;
  if reservation.funding_source_type='owner_budget' then
    funding_result:=tongs.begin_owner_provider_attempt(operation.reservation_id,p_attempt_key,900,
      jsonb_build_object('provider','assemblyai','attempt',1,'beneficiary_user_id',operation.user_id));
  else
    funding_result:=tongs.begin_provider_attempt(operation.reservation_id,p_attempt_key,900,jsonb_build_object('provider','assemblyai','attempt',1));
  end if;
  if coalesce((funding_result->>'provider_execution_authorized')::boolean,false) is not true then
    perform tongs.record_paid_operation_aggregate_outcome(operation.reservation_id,p_attempt_key||':preprovider-release','preprovider_release',null,null,jsonb_build_object('transmitted',false));
    return jsonb_build_object('provider_execution_authorized',false,'reason',coalesce(funding_result->>'reason','funding_gate_denied'));
  end if;
  insert into tongs.hammer_transcription_provider_attempts(id,operation_id,attempt_number,state,request_sha256,evidence_json)
  values(p_attempt_id,operation.id,1,'authorized',p_request_sha256,jsonb_build_object('attempt_key',p_attempt_key));
  update tongs.hammer_transcription_operations set execution_authorized=true,state='queued' where id=operation.id;
  insert into tongs.hammer_first_transcription_activation_consumptions(id,activation_authority_id,operation_id,provider_attempt_id)
  values(extensions.uuid_generate_v5(authority.id,'consumed'),authority.id,operation.id,p_attempt_id);
  return jsonb_build_object('provider_execution_authorized',true,'operation_id',operation.id,
    'funding_source',reservation.funding_source_type,'customer_charge_micros',0,
    'complete_wholesale_ceiling_micros',operation.complete_wholesale_ceiling_micros,'automatic_retries',0);
end $$;

create or replace function tongs.fail_hammer_first_transcription_attempt(
  p_operation_id uuid,p_attempt_id uuid,p_failure_class text,p_evidence_json jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare operation tongs.hammer_transcription_operations%rowtype; reservation tongs.funding_reservations%rowtype;
  actual_supplier bigint:=coalesce((p_evidence_json->>'actual_supplier_cost_micros')::bigint,0);
  supplier_cost_verified boolean:=coalesce((p_evidence_json->>'supplier_cost_verified')::boolean,false);
begin
  perform tongs._require_pricing_service_role(); select * into operation from tongs.hammer_transcription_operations where id=p_operation_id;
  select * into reservation from tongs.funding_reservations where id=operation.reservation_id;
  if actual_supplier<0 or actual_supplier>operation.supplier_ceiling_micros
  then raise exception 'failure supplier exposure exceeds certified ceiling' using errcode='22023'; end if;
  update tongs.hammer_transcription_provider_attempts set state='failed',completed_at=clock_timestamp(),failure_class=p_failure_class,evidence_json=p_evidence_json where id=p_attempt_id and operation_id=p_operation_id and state in ('authorized','queued','processing');
  update tongs.hammer_transcription_operations set state='failed' where id=p_operation_id;
  perform tongs.record_provider_failure(operation.reservation_id,p_attempt_id::text||':provider-failure',p_failure_class,p_evidence_json);
  if not supplier_cost_verified then
    perform tongs.record_paid_operation_aggregate_outcome(operation.reservation_id,p_attempt_id::text||':aggregate-unknown-cost',
      'ambiguous',null,null,p_evidence_json||jsonb_build_object('customer_relieved',true,'automatic_retry_allowed',false));
    return jsonb_build_object('state','failed','customer_charge_micros',0,
      'reservation_reconciliation_required',true,'automatic_retry_allowed',false);
  end if;
  if reservation.funding_source_type='owner_budget' and actual_supplier>0 then
    perform tongs.settle_owner_operation(operation.reservation_id,p_attempt_id,p_attempt_id::text||':owner-failure-exposure',
      'success',null,actual_supplier,p_evidence_json||jsonb_build_object('operation_outcome','failure','customer_relieved',true));
  else
    perform tongs.release_operation(operation.reservation_id,p_attempt_id::text||':customer-relief',
      'provider failure is nonbillable to the customer',p_evidence_json||jsonb_build_object('transmitted',true));
  end if;
  perform tongs.record_paid_operation_aggregate_outcome(operation.reservation_id,p_attempt_id::text||':aggregate-failure',
    'failure',actual_supplier,null,p_evidence_json||jsonb_build_object('customer_relieved',true));
  return jsonb_build_object('state','failed','customer_charge_micros',0,
    'owner_expense_micros',case when reservation.funding_source_type='owner_budget' then actual_supplier else 0 end,
    'reservation_reconciliation_required',false,'automatic_retry_allowed',false);
end $$;

create or replace function tongs.settle_hammer_first_transcription_operation(
  p_operation_id uuid,p_settlement_id uuid,p_settlement_key text,
  p_actual_supplier_cost_micros bigint,p_supplier_evidence_json jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare operation tongs.hammer_transcription_operations%rowtype; reservation tongs.funding_reservations%rowtype; settled jsonb;
  supporting_actual bigint:=coalesce((p_supplier_evidence_json->>'actual_supporting_cost_micros')::bigint,0);
  promotional_offset bigint:=coalesce((p_supplier_evidence_json->>'promotional_credit_offset_micros')::bigint,0);
  owner_expense bigint;
begin
  perform tongs._require_pricing_service_role(); select * into operation from tongs.hammer_transcription_operations where id=p_operation_id for update;
  select * into reservation from tongs.funding_reservations where id=operation.reservation_id;
  if operation.canonical_transcript_id is null or p_actual_supplier_cost_micros is null
     or p_actual_supplier_cost_micros<0 or p_actual_supplier_cost_micros>operation.supplier_ceiling_micros
     or supporting_actual<0 or supporting_actual>operation.supporting_cost_ceiling_micros
     or promotional_offset<0 or promotional_offset>p_actual_supplier_cost_micros
     or coalesce((p_supplier_evidence_json->>'authoritative')::boolean,false) is not true
  then raise exception 'canonical persistence and authoritative supplier reconciliation required before settlement; bounded owner evidence is required' using errcode='42501'; end if;
  if reservation.funding_source_type='owner_budget' then
    owner_expense:=p_actual_supplier_cost_micros-promotional_offset+supporting_actual;
    settled:=tongs.settle_owner_operation(operation.reservation_id,p_settlement_id,p_settlement_key,'success',null,
      owner_expense,p_supplier_evidence_json||jsonb_build_object('gross_supplier_cost_micros',p_actual_supplier_cost_micros,
        'promotional_credit_offset_micros',promotional_offset,'actual_supporting_cost_micros',supporting_actual));
  else
    settled:=tongs.settle_operation(operation.reservation_id,p_settlement_id,p_settlement_key,'success',null,
      p_actual_supplier_cost_micros+operation.supporting_cost_ceiling_micros,p_supplier_evidence_json);
  end if;
  update tongs.hammer_transcription_operations set state='completed',settled_at=clock_timestamp() where id=operation.id;
  perform tongs.record_paid_operation_aggregate_outcome(operation.reservation_id,p_settlement_key||':aggregate','reconciled',p_actual_supplier_cost_micros,null,p_supplier_evidence_json);
  return settled||jsonb_build_object('state','completed','canonical_transcript_id',operation.canonical_transcript_id,
    'customer_charge_micros',case when reservation.funding_source_type='owner_budget' then 0 else operation.accepted_customer_charge_micros end);
end $$;

do $$ declare signature regprocedure; begin
  foreach signature in array array[
    'tongs.install_hammer_owner_funded_first_transcription_authority(uuid,uuid,uuid,uuid,timestamptz,timestamptz,text)'::regprocedure,
    'tongs._active_hammer_owner_sponsorship_for_quote(uuid)'::regprocedure
  ] loop
    execute format('revoke all on function %s from public,anon,authenticated',signature);
    execute format('grant execute on function %s to service_role',signature);
  end loop;
end $$;

do $$ begin
  if exists(select 1 from tongs.hammer_owner_funded_transcription_authorities)
  then raise exception 'owner-funded Hammer migration must remain financially inert'; end if;
  if exists(select 1 from tongs.owner_operating_budgets budget
    where lower(coalesce(budget.provider,''))='assemblyai'
      and lower(coalesce(budget.route,''))='hammer.transcript_prep')
  then raise exception 'owner-funded Hammer migration must not install a budget'; end if;
end $$;

comment on table tongs.hammer_owner_funded_transcription_authorities is
  'Private, service-installed authority for one owner-sponsored Brad transcription. It never creates customer funds, credits, deposits, or provider work.';
comment on function tongs.install_hammer_owner_funded_first_transcription_authority(uuid,uuid,uuid,uuid,timestamptz,timestamptz,text) is
  'Separately authorized installer for one capped owner operating budget and exact inactive Brad sponsorship. It does not quote, reserve, or call AssemblyAI.';

notify pgrst,'reload schema';
commit;
