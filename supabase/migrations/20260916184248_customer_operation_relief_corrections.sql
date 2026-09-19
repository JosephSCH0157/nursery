-- Append-only correction authority for customer-operation reliefs that were
-- recorded after a canonical paid result had already settled successfully.
-- Corrections preserve the relief and subtract only its proven economic effect.
begin;

create table tongs.customer_operation_relief_corrections (
  id uuid primary key,
  relief_id uuid not null references tongs.customer_operation_reliefs(id) on delete restrict,
  reservation_id uuid not null references tongs.funding_reservations(id) on delete restrict,
  original_consumption_id uuid not null references tongs.customer_deposit_consumptions(id) on delete restrict,
  canonical_result_id uuid not null references tongs.openai_text_persisted_results(id) on delete restrict,
  funding_environment text not null check (funding_environment in ('test','live')),
  corrected_credit_units bigint not null check (corrected_credit_units > 0),
  corrected_customer_credit_micros bigint not null check (corrected_customer_credit_micros > 0),
  corrected_revenue_micros bigint not null check (corrected_revenue_micros > 0),
  reason_code text not null check (reason_code ~ '^[a-z][a-z0-9_]{2,95}$'),
  reason text not null check (nullif(btrim(reason),'') is not null),
  idempotency_key text not null unique check (length(btrim(idempotency_key)) between 8 and 240),
  operator_actor_id uuid not null references auth.users(id) on delete restrict,
  journal_event_id uuid not null unique references tongs.accounting_journal_events(id) on delete restrict,
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json)='object'),
  corrected_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index customer_operation_relief_corrections_relief_idx
  on tongs.customer_operation_relief_corrections(relief_id,corrected_at,id);

create trigger trg_customer_operation_relief_corrections_append_only
before update or delete on tongs.customer_operation_relief_corrections
for each row execute function tongs._reject_accounting_mutation();

alter table tongs.customer_operation_relief_corrections enable row level security;

create or replace function tongs.correct_customer_operation_relief(
  p_correction_id uuid,
  p_relief_id uuid,
  p_reservation_id uuid,
  p_original_consumption_id uuid,
  p_canonical_result_id uuid,
  p_funding_environment text,
  p_corrected_credit_units bigint,
  p_corrected_customer_credit_micros bigint,
  p_corrected_revenue_micros bigint,
  p_reason_code text,
  p_reason text,
  p_idempotency_key text,
  p_operator_user_id uuid,
  p_evidence_json jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_key text:=btrim(coalesce(p_idempotency_key,''));
  v_reason_code text:=btrim(coalesce(p_reason_code,''));
  v_reason text:=btrim(coalesce(p_reason,''));
  v_evidence jsonb:=coalesce(p_evidence_json,'{}'::jsonb);
  v_existing tongs.customer_operation_relief_corrections%rowtype;
  v_relief tongs.customer_operation_reliefs%rowtype;
  v_reservation tongs.funding_reservations%rowtype;
  v_consumption tongs.customer_deposit_consumptions%rowtype;
  v_result tongs.openai_text_persisted_results%rowtype;
  v_settlement tongs.funding_reservation_events%rowtype;
  v_workspace_id uuid;
  v_positive_money_count integer;
  v_negative_money_count integer;
  v_unit_count integer;
  v_positive_money_total bigint;
  v_negative_money_total bigint;
  v_unit_total bigint;
  v_revenue_account text;
  v_liability_account text;
  v_credit_account text;
  v_prior_units bigint;
  v_prior_customer_micros bigint;
  v_prior_revenue_micros bigint;
  v_payload jsonb;
begin
  perform tongs._require_accounting_service_role();
  if p_operator_user_id is null or not tongs.is_platform_operator(p_operator_user_id) then
    raise exception 'service-role platform operator required' using errcode='42501';
  end if;
  if p_correction_id is null or p_relief_id is null or p_reservation_id is null
     or p_original_consumption_id is null or p_canonical_result_id is null
     or p_funding_environment not in ('test','live')
     or coalesce(p_corrected_credit_units,0)<=0
     or coalesce(p_corrected_customer_credit_micros,0)<=0
     or coalesce(p_corrected_revenue_micros,0)<=0
     or p_corrected_customer_credit_micros<>p_corrected_revenue_micros
     or v_reason_code !~ '^[a-z][a-z0-9_]{2,95}$'
     or v_reason=''
     or length(v_key) not between 8 and 240
     or jsonb_typeof(v_evidence)<>'object' then
    raise exception 'invalid customer-operation relief correction' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('customer-relief-correction:'||p_relief_id::text,0));
  select * into v_existing
  from tongs.customer_operation_relief_corrections correction
  where correction.id=p_correction_id or correction.idempotency_key=v_key
  order by (correction.id=p_correction_id) desc
  limit 1;
  if found then
    if v_existing.id<>p_correction_id
       or v_existing.relief_id<>p_relief_id
       or v_existing.reservation_id<>p_reservation_id
       or v_existing.original_consumption_id<>p_original_consumption_id
       or v_existing.canonical_result_id<>p_canonical_result_id
       or v_existing.funding_environment<>p_funding_environment
       or v_existing.corrected_credit_units<>p_corrected_credit_units
       or v_existing.corrected_customer_credit_micros<>p_corrected_customer_credit_micros
       or v_existing.corrected_revenue_micros<>p_corrected_revenue_micros
       or v_existing.reason_code<>v_reason_code
       or v_existing.reason<>v_reason
       or v_existing.idempotency_key<>v_key
       or v_existing.operator_actor_id<>p_operator_user_id
       or v_existing.evidence_json<>v_evidence then
      raise exception 'customer-operation relief correction replay conflict' using errcode='23505';
    end if;
    return jsonb_build_object(
      'correction_id',v_existing.id,'journal_event_id',v_existing.journal_event_id,
      'relief_id',v_existing.relief_id,'replay',true,
      'corrected_credit_units',v_existing.corrected_credit_units,
      'corrected_customer_credit_micros',v_existing.corrected_customer_credit_micros,
      'corrected_revenue_micros',v_existing.corrected_revenue_micros
    );
  end if;

  select * into v_relief from tongs.customer_operation_reliefs
  where id=p_relief_id for update;
  if not found then raise exception 'customer-operation relief not found' using errcode='P0002'; end if;
  select * into v_reservation from tongs.funding_reservations
  where id=p_reservation_id;
  if not found then raise exception 'funding reservation not found' using errcode='P0002'; end if;
  if v_relief.reservation_id<>v_reservation.id
     or v_relief.funding_source_id<>v_reservation.funding_source_id
     or v_relief.funding_source_type<>v_reservation.funding_source_type then
    raise exception 'relief and reservation do not match' using errcode='22023';
  end if;
  if v_reservation.funding_environment<>p_funding_environment then
    raise exception 'relief correction environment mismatch' using errcode='22023';
  end if;
  -- Purchased-credit relief is the only balance authority that presently
  -- restores customer-operation relief. Fail closed for allowance/beta rows
  -- until their own canonical projections explicitly support correction.
  if v_relief.funding_source_type<>'customer_deposit' then
    raise exception 'relief correction requires purchased-credit funding' using errcode='22023';
  end if;
  if v_relief.original_consumption_id<>p_original_consumption_id then
    raise exception 'original consumption does not match relief' using errcode='22023';
  end if;
  select * into v_consumption from tongs.customer_deposit_consumptions
  where id=p_original_consumption_id;
  if not found or v_consumption.deposit_id<>v_relief.funding_source_id
     or v_consumption.user_id<>v_reservation.user_id
     or v_consumption.operation_id<>v_reservation.operation_id then
    raise exception 'original consumption does not match reservation' using errcode='22023';
  end if;
  select * into v_result from tongs.openai_text_persisted_results
  where id=p_canonical_result_id;
  if not found or v_result.reservation_id<>v_reservation.id
     or v_result.operation_id<>v_reservation.operation_id
     or v_result.user_id<>v_reservation.user_id then
    raise exception 'qualifying canonical paid result not found' using errcode='P0002';
  end if;
  select * into v_settlement from tongs.funding_reservation_events
  where reservation_id=v_reservation.id and event_type='settled'
  order by sequence desc limit 1;
  if not found or coalesce(v_settlement.customer_charge_micros,0)<v_relief.customer_credit_micros
     or coalesce(v_settlement.credit_units,0)<v_relief.restored_units
     or v_consumption.recognized_revenue_micros<v_relief.revenue_reversal_micros
     or v_consumption.credit_units_consumed<v_relief.restored_units then
    raise exception 'relief lacks matching successful settlement evidence' using errcode='22023';
  end if;

  select coalesce(sum(corrected_credit_units),0),
         coalesce(sum(corrected_customer_credit_micros),0),
         coalesce(sum(corrected_revenue_micros),0)
    into v_prior_units,v_prior_customer_micros,v_prior_revenue_micros
  from tongs.customer_operation_relief_corrections
  where relief_id=v_relief.id;
  if v_prior_units+p_corrected_credit_units>v_relief.restored_units then
    raise exception 'relief correction exceeds restored credit units' using errcode='22003';
  end if;
  if v_prior_customer_micros+p_corrected_customer_credit_micros>v_relief.customer_credit_micros
     or v_prior_revenue_micros+p_corrected_revenue_micros>v_relief.revenue_reversal_micros then
    raise exception 'relief correction exceeds monetary relief' using errcode='22003';
  end if;

  select
    count(*) filter(where entry.currency=v_relief.currency and entry.amount_micros>0),
    count(*) filter(where entry.currency=v_relief.currency and entry.amount_micros<0),
    count(*) filter(where entry.unit_kind='forge_credit' and entry.quantity_delta>0),
    coalesce(sum(entry.amount_micros) filter(where entry.currency=v_relief.currency and entry.amount_micros>0),0),
    coalesce(sum(entry.amount_micros) filter(where entry.currency=v_relief.currency and entry.amount_micros<0),0),
    coalesce(sum(entry.quantity_delta) filter(where entry.unit_kind='forge_credit'),0),
    max(entry.account_code) filter(where entry.currency=v_relief.currency and entry.amount_micros>0),
    max(entry.account_code) filter(where entry.currency=v_relief.currency and entry.amount_micros<0),
    max(entry.account_code) filter(where entry.unit_kind='forge_credit' and entry.quantity_delta>0)
  into v_positive_money_count,v_negative_money_count,v_unit_count,
       v_positive_money_total,v_negative_money_total,v_unit_total,
       v_revenue_account,v_liability_account,v_credit_account
  from tongs.accounting_journal_entries entry
  where entry.event_id=v_relief.journal_event_id;
  if v_positive_money_count<>1 or v_negative_money_count<>1 or v_unit_count<>1
     or v_positive_money_total<>v_relief.revenue_reversal_micros
     or v_negative_money_total<>-v_relief.revenue_reversal_micros
     or v_unit_total<>v_relief.restored_units then
    raise exception 'target relief journal is not a canonical reversible relief' using errcode='22023';
  end if;
  select workspace_id into v_workspace_id from tongs.accounting_journal_events
  where id=v_relief.journal_event_id;

  v_payload:=jsonb_build_object(
    'correction_id',p_correction_id,'relief_id',v_relief.id,
    'reservation_id',v_reservation.id,'original_consumption_id',v_consumption.id,
    'canonical_result_id',v_result.id,'funding_environment',p_funding_environment,
    'corrected_credit_units',p_corrected_credit_units,
    'corrected_customer_credit_micros',p_corrected_customer_credit_micros,
    'corrected_revenue_micros',p_corrected_revenue_micros,
    'reason_code',v_reason_code,'reason',v_reason,'evidence',v_evidence
  );
  perform tongs._create_accounting_event(
    p_correction_id,'customer-relief-correction:'||v_key,
    'customer_operation_relief_corrected',p_funding_environment,
    'customer_operation_relief',v_relief.id::text,v_relief.currency,
    v_reservation.user_id,v_workspace_id,p_operator_user_id,v_payload,now()
  );
  insert into tongs.customer_operation_relief_corrections(
    id,relief_id,reservation_id,original_consumption_id,canonical_result_id,
    funding_environment,corrected_credit_units,corrected_customer_credit_micros,
    corrected_revenue_micros,reason_code,reason,idempotency_key,
    operator_actor_id,journal_event_id,evidence_json,corrected_at
  ) values (
    p_correction_id,v_relief.id,v_reservation.id,v_consumption.id,v_result.id,
    p_funding_environment,p_corrected_credit_units,p_corrected_customer_credit_micros,
    p_corrected_revenue_micros,v_reason_code,v_reason,v_key,
    p_operator_user_id,p_correction_id,v_evidence,now()
  ) returning * into v_existing;
  insert into tongs.accounting_journal_entries(
    event_id,line_number,account_code,user_id,workspace_id,deposit_id,
    currency,amount_micros,metadata_json
  ) values
    (p_correction_id,1,v_revenue_account,v_reservation.user_id,v_workspace_id,
      v_relief.funding_source_id,v_relief.currency,-p_corrected_revenue_micros,
      jsonb_build_object('relief_id',v_relief.id)),
    (p_correction_id,2,v_liability_account,v_reservation.user_id,v_workspace_id,
      v_relief.funding_source_id,v_relief.currency,p_corrected_revenue_micros,
      jsonb_build_object('relief_id',v_relief.id));
  insert into tongs.accounting_journal_entries(
    event_id,line_number,account_code,user_id,workspace_id,deposit_id,
    unit_kind,quantity_delta,metadata_json
  ) values (
    p_correction_id,3,v_credit_account,v_reservation.user_id,v_workspace_id,
    v_relief.funding_source_id,'forge_credit',-p_corrected_credit_units,
    jsonb_build_object('relief_id',v_relief.id)
  );
  perform tongs._assert_accounting_event_balanced(p_correction_id);
  return jsonb_build_object(
    'correction_id',v_existing.id,'journal_event_id',v_existing.journal_event_id,
    'relief_id',v_existing.relief_id,'replay',false,
    'corrected_credit_units',v_existing.corrected_credit_units,
    'corrected_customer_credit_micros',v_existing.corrected_customer_credit_micros,
    'corrected_revenue_micros',v_existing.corrected_revenue_micros
  );
end $$;

create or replace function tongs._unconsumed_deposit_credit_units(p_deposit_id uuid)
returns bigint language sql stable security definer set search_path=pg_catalog as $$
  select greatest(case when conversion.deposit_id is not null then
    conversion.canonical_available_credit_units
      - coalesce((select sum(c.credit_units_consumed)
          from tongs.customer_deposit_consumptions c
          where c.deposit_id=deposit.id and not exists (
            select 1 from tongs.legacy_deposit_conversion_consumptions mapped
            where mapped.consumption_id=c.id)),0)
      - coalesce((select sum(r.refunded_credit_units)
          from tongs.customer_deposit_refunds r
          where r.deposit_id=deposit.id and not exists (
            select 1 from tongs.legacy_deposit_conversion_refunds mapped
            where mapped.refund_id=r.id)),0)
      + coalesce((select sum(relief.restored_units)
          from tongs.customer_operation_reliefs relief
          where relief.funding_source_type='customer_deposit'
            and relief.funding_source_id=deposit.id),0)
      - coalesce((select sum(correction.corrected_credit_units)
          from tongs.customer_operation_relief_corrections correction
          join tongs.customer_operation_reliefs relief on relief.id=correction.relief_id
          where relief.funding_source_type='customer_deposit'
            and relief.funding_source_id=deposit.id),0)
    else deposit.credit_units
      - coalesce((select sum(c.credit_units_consumed)
          from tongs.customer_deposit_consumptions c where c.deposit_id=deposit.id),0)
      - coalesce((select sum(r.refunded_credit_units)
          from tongs.customer_deposit_refunds r where r.deposit_id=deposit.id),0)
      + coalesce((select sum(relief.restored_units)
          from tongs.customer_operation_reliefs relief
          where relief.funding_source_type='customer_deposit'
            and relief.funding_source_id=deposit.id),0)
      - coalesce((select sum(correction.corrected_credit_units)
          from tongs.customer_operation_relief_corrections correction
          join tongs.customer_operation_reliefs relief on relief.id=correction.relief_id
          where relief.funding_source_type='customer_deposit'
            and relief.funding_source_id=deposit.id),0)
    end,0)::bigint
  from tongs.customer_deposits deposit
  left join tongs.legacy_deposit_credit_conversions conversion
    on conversion.deposit_id=deposit.id
  where deposit.id=p_deposit_id
$$;

create or replace function tongs._unconsumed_deposit_value_micros(p_deposit_id uuid)
returns bigint language sql stable security definer set search_path=pg_catalog as $$
  select greatest(
    deposit.gross_amount_micros
      - coalesce((select sum(c.recognized_revenue_micros)
          from tongs.customer_deposit_consumptions c where c.deposit_id=deposit.id),0)
      - coalesce((select sum(r.liability_release_micros)
          from tongs.customer_deposit_refunds r where r.deposit_id=deposit.id),0)
      + coalesce((select sum(relief.revenue_reversal_micros)
          from tongs.customer_operation_reliefs relief
          where relief.funding_source_type='customer_deposit'
            and relief.funding_source_id=deposit.id),0)
      - coalesce((select sum(correction.corrected_revenue_micros)
          from tongs.customer_operation_relief_corrections correction
          join tongs.customer_operation_reliefs relief on relief.id=correction.relief_id
          where relief.funding_source_type='customer_deposit'
            and relief.funding_source_id=deposit.id),0),
    0
  )::bigint
  from tongs.customer_deposits deposit where deposit.id=p_deposit_id
$$;

do $$
declare definition text; changed text;
begin
  select pg_get_functiondef('tongs.read_failure_financials(integer)'::regprocedure) into definition;
  changed:=replace(
    definition,
    '  left join tongs.customer_operation_reliefs rel on rel.reservation_id=r.id',
    $replacement$  left join lateral(
   select greatest(
     coalesce(sum(net.gross_revenue_reversal_micros),0)
       - coalesce(sum(net.corrected_revenue_micros),0),0
   )::bigint revenue_reversal_micros
   from (
     select relief.revenue_reversal_micros gross_revenue_reversal_micros,
       coalesce((select sum(correction.corrected_revenue_micros)
         from tongs.customer_operation_relief_corrections correction
         where correction.relief_id=relief.id),0) corrected_revenue_micros
     from tongs.customer_operation_reliefs relief
     where relief.reservation_id=r.id
   ) net
  ) rel on true$replacement$
  );
  if changed=definition or position('customer_operation_relief_corrections' in changed)=0 then
    raise exception 'failure financial reporting changed upstream; explicit review required';
  end if;
  execute changed;
end $$;

create or replace function tongs.read_my_spending_operation(p_operation_id text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare
  v_user uuid:=auth.uid();
  v_quote tongs.customer_spending_quotes%rowtype;
  v_res tongs.funding_reservations%rowtype;
  v_settlement tongs.funding_reservation_events%rowtype;
  v_relief tongs.customer_operation_reliefs%rowtype;
  v_corrected_units bigint:=0;
  v_corrected_customer_micros bigint:=0;
  v_net_restored_units bigint:=0;
  v_net_relief_micros bigint:=0;
  v_label text;
begin
  if v_user is null then raise exception 'authentication required' using errcode='42501'; end if;
  select * into v_quote from tongs.customer_spending_quotes
  where user_id=v_user and operation_id=btrim(p_operation_id);
  if not found then raise exception 'spending operation not found' using errcode='P0002'; end if;
  select * into v_res from tongs.funding_reservations where quote_id=v_quote.id;
  if v_res.id is not null then
    select * into v_settlement from tongs.funding_reservation_events
    where reservation_id=v_res.id and event_type='settled' order by sequence desc limit 1;
    select * into v_relief from tongs.customer_operation_reliefs where reservation_id=v_res.id;
  end if;
  if v_relief.id is not null then
    select coalesce(sum(corrected_credit_units),0),
           coalesce(sum(corrected_customer_credit_micros),0)
      into v_corrected_units,v_corrected_customer_micros
    from tongs.customer_operation_relief_corrections
    where relief_id=v_relief.id;
    v_net_restored_units:=greatest(v_relief.restored_units-v_corrected_units,0);
    v_net_relief_micros:=greatest(v_relief.customer_credit_micros-v_corrected_customer_micros,0);
  end if;
  v_label:=case v_res.funding_source_type
    when 'customer_deposit' then 'Verified AI credit purchase'
    when 'paid_allowance' then 'Paid-plan allowance'
    when 'beta_grant' then 'Beta Forge Credits'
    when 'owner_budget' then 'Forge owner testing'
    when 'none' then 'No Forge-funded cost' else null end;
  return jsonb_build_object(
    'operation_id',v_quote.operation_id,'quote_id',v_quote.id,'currency',v_quote.currency,
    'normal_maximum_charge_micros',v_quote.normal_maximum_charge_micros,
    'failure_maximum_charge_micros',0,
    'failure_terms','Forge-caused, provider-caused, validation, persistence, and unknown-fault failures charge $0.',
    'uncertain_submission_terms','Reservation remains held for bounded reconciliation; Forge will not automatically resubmit.',
    'provider_funding_summary',v_quote.provider_funding_summary,
    'accepted',exists(select 1 from tongs.customer_spending_quote_acceptances where quote_id=v_quote.id),
    'reservation_state',case when v_net_relief_micros>0 or v_net_restored_units>0
      then 'customer_relieved' when v_res.id is null then null else tongs._funding_reservation_state(v_res.id) end,
    'funding_source',v_res.funding_source_type,'funding_label',v_label,
    'gross_customer_charge_micros',coalesce(v_settlement.customer_charge_micros,0),
    'customer_relief_micros',v_net_relief_micros,
    'customer_relief_correction_micros',v_corrected_customer_micros,
    'customer_charge_micros',greatest(coalesce(v_settlement.customer_charge_micros,0)-v_net_relief_micros,0),
    'credit_units',greatest(coalesce(v_settlement.credit_units,0)-v_net_restored_units,0),
    'receipt_status',case when v_net_relief_micros>0 or v_net_restored_units>0
      then 'failed_customer_relieved' when v_res.id is null then 'quoted'
      when v_settlement.id is not null then 'settled' else tongs._funding_reservation_state(v_res.id) end,
    'byo_notice','Charges billed directly by a customer provider credential are outside Forge refund control.',
    'execution_authorized',false
  );
end $$;

revoke all on tongs.customer_operation_relief_corrections
  from public,anon,authenticated,service_role;
grant select on tongs.customer_operation_relief_corrections to service_role;
revoke all on function tongs.correct_customer_operation_relief(
  uuid,uuid,uuid,uuid,uuid,text,bigint,bigint,bigint,text,text,text,uuid,jsonb
) from public,anon,authenticated,service_role;
grant execute on function tongs.correct_customer_operation_relief(
  uuid,uuid,uuid,uuid,uuid,text,bigint,bigint,bigint,text,text,text,uuid,jsonb
) to service_role;

revoke all on function tongs._unconsumed_deposit_credit_units(uuid)
  from public,anon,authenticated;
revoke all on function tongs._unconsumed_deposit_value_micros(uuid)
  from public,anon,authenticated;
grant execute on function tongs._unconsumed_deposit_credit_units(uuid) to service_role;
grant execute on function tongs._unconsumed_deposit_value_micros(uuid) to service_role;

comment on table tongs.customer_operation_relief_corrections is
  'Append-only operator corrections that preserve a customer-operation relief while subtracting its proven erroneous economic effect.';
comment on function tongs.correct_customer_operation_relief(
  uuid,uuid,uuid,uuid,uuid,text,bigint,bigint,bigint,text,text,text,uuid,jsonb
) is 'Operator-authorized, idempotent correction of a linked purchased-credit relief with canonical settled-result evidence.';
comment on function tongs._unconsumed_deposit_credit_units(uuid) is
  'Canonical purchased Forge Credit balance after consumption, Stripe refunds, relief restoration, and append-only relief correction.';
comment on function tongs._unconsumed_deposit_value_micros(uuid) is
  'Canonical purchased-credit liability after consumption, Stripe refunds, relief restoration, and append-only relief correction.';

notify pgrst,'reload schema';
commit;

