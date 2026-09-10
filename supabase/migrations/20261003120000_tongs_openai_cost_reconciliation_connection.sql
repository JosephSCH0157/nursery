-- Connect OpenAI organization evidence to append-only expense replacement and
-- aggregate Forge-exposure accounting. No price, rollout, budget, customer
-- settlement, or provider-execution setting is activated by this migration.
begin;

create table tongs.openai_reconciliation_batch_state_events (
  id uuid primary key,
  batch_id uuid not null references tongs.openai_organization_reconciliation_batches(id) on delete restrict,
  sequence integer not null check(sequence>0),
  event_key text not null unique check(length(btrim(event_key)) between 8 and 300),
  state text not null check(state in ('accepted','superseded','overlap_quarantined')),
  related_batch_id uuid references tongs.openai_organization_reconciliation_batches(id) on delete restrict,
  scope_key text not null check(scope_key ~ '^[0-9a-f]{64}$'),
  reason text not null check(nullif(btrim(reason),'') is not null),
  created_at timestamptz not null default now(),
  unique(batch_id,sequence)
);

alter table tongs.openai_reconciliation_batch_state_events enable row level security;
alter table tongs.openai_reconciliation_batch_state_events force row level security;
revoke all on tongs.openai_reconciliation_batch_state_events from public,anon,authenticated,service_role;
grant select,insert on tongs.openai_reconciliation_batch_state_events to service_role;
create trigger openai_reconciliation_batch_state_events_immutable
before update or delete on tongs.openai_reconciliation_batch_state_events
for each row execute function tongs._reject_accounting_mutation();

create table tongs.openai_historical_unmatched_cost_estimates (
  id uuid primary key,
  source_key text not null unique,
  amount_micros bigint not null check(amount_micros>=0),
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  evidence_class text not null check(evidence_class='usage_based_estimate'),
  resolution_state text not null check(resolution_state='unresolved'),
  potential_provider_batch_overlap boolean not null default true,
  source_reference text not null,
  missing_evidence text not null,
  evidence_json jsonb not null default '{}'::jsonb check(jsonb_typeof(evidence_json)='object'),
  created_at timestamptz not null default now()
);
alter table tongs.openai_historical_unmatched_cost_estimates enable row level security;
alter table tongs.openai_historical_unmatched_cost_estimates force row level security;
revoke all on tongs.openai_historical_unmatched_cost_estimates from public,anon,authenticated,service_role;
grant select on tongs.openai_historical_unmatched_cost_estimates to service_role;
create trigger openai_historical_unmatched_cost_estimates_immutable
before update or delete on tongs.openai_historical_unmatched_cost_estimates
for each row execute function tongs._reject_accounting_mutation();
insert into tongs.openai_historical_unmatched_cost_estimates(
 id,source_key,amount_micros,currency,evidence_class,resolution_state,potential_provider_batch_overlap,source_reference,missing_evidence,evidence_json
) values(
 '59000000-0000-4000-8000-000000000001','historical-forge-openai-text-estimate-0.490925',490925,'USD','usage_based_estimate','unresolved',true,
 'docs/billing/OPENAI_TEXT_EVIDENCE_AND_SUPPORT_COSTS.md',
 'The retained estimate has no exact reporting interval, API-key identity, or provider cost bucket/request join. It cannot be replaced or netted against organization totals.',
 '{"customer_charge_micros":0,"authoritative":false,"accounting_treatment":"separate_unresolved_estimate_not_added_to_authoritative_total"}'
);

-- An unresolved expense had no amount booked. Its first authoritative
-- allocation is therefore a full positive adjustment; an estimate receives
-- only confirmed-minus-estimated.
alter table tongs.openai_supplier_expense_reconciliation_adjustments
  alter column estimated_amount_micros drop not null;

create or replace function tongs._openai_reconciliation_scope_key(p_source_kind text,p_currency text,p_raw jsonb)
returns text language sql immutable security definer set search_path=pg_catalog as $$
  select encode(extensions.digest(convert_to(
    coalesce(p_source_kind,'')||':'||upper(coalesce(p_currency,''))||':'||
    coalesce((select string_agg(value,',' order by value) from jsonb_array_elements_text(coalesce(p_raw->'project_scope','[]'::jsonb))),''),
    'utf8'),'sha256'),'hex');
$$;

create or replace function tongs._openai_reconciliation_batch_state(p_batch_id uuid)
returns text language sql stable security definer set search_path=pg_catalog as $$
  select e.state from tongs.openai_reconciliation_batch_state_events e
  where e.batch_id=p_batch_id order by e.sequence desc limit 1;
$$;

-- Backfill the one pre-connection batch without changing it. Later complete
-- windows can supersede it through another append-only state event.
insert into tongs.openai_reconciliation_batch_state_events(id,batch_id,sequence,event_key,state,scope_key,reason)
select extensions.uuid_generate_v5(b.id,'reconciliation-state:accepted:legacy'),b.id,1,
  'openai-reconciliation:'||b.id::text||':accepted:legacy','accepted',
  tongs._openai_reconciliation_scope_key(b.source_kind,b.currency,b.raw_evidence_json),
  'Backfilled as the effective evidence available before overlap-safe reconciliation.'
from tongs.openai_organization_reconciliation_batches b
where not exists(select 1 from tongs.openai_reconciliation_batch_state_events e where e.batch_id=b.id);

alter table tongs.restricted_beta_exposure_events
  drop constraint restricted_beta_exposure_events_event_type_check;
alter table tongs.restricted_beta_exposure_events
  add constraint restricted_beta_exposure_events_event_type_check check(event_type in (
    'reserved','attempt_started','ambiguous','customer_relieved_supplier_obligation',
    'settled_unconfirmed','reconciliation_partial','supplier_recovery','released','reconciled'
  ));

create or replace function tongs.record_restricted_beta_exposure_outcome(
 p_hold_id uuid,p_event_key text,p_event_type text,p_supplier_obligation_micros bigint default null,
 p_supplier_recovery_micros bigint default null,p_customer_funding_delta_micros bigint default 0,
 p_forge_loss_delta_micros bigint default 0,p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare h tongs.restricted_beta_exposure_holds%rowtype; existing tongs.restricted_beta_exposure_events%rowtype;
 last_type text; attempts bigint;
begin
 perform tongs._require_pricing_service_role();
 if p_event_type not in ('ambiguous','customer_relieved_supplier_obligation','settled_unconfirmed','reconciliation_partial','supplier_recovery','released','reconciled') then
  raise exception 'invalid outcome' using errcode='22023'; end if;
 select * into existing from tongs.restricted_beta_exposure_events where event_key=p_event_key;
 if found then return to_jsonb(existing)||jsonb_build_object('replay',true); end if;
 select * into h from tongs.restricted_beta_exposure_holds where id=p_hold_id for update;
 if not found then raise exception 'unknown exposure hold' using errcode='22023'; end if;
 select event_type into last_type from tongs.restricted_beta_exposure_events where hold_id=h.id order by sequence desc limit 1;
 if last_type='released' then return jsonb_build_object('hold_id',h.id,'state',last_type,'replay',true); end if;
 if exists(select 1 from tongs.restricted_beta_exposure_events where hold_id=h.id and event_type='reconciled')
    and p_event_type not in ('reconciled','supplier_recovery') then
  return jsonb_build_object('hold_id',h.id,'state',last_type,'replay',true); end if;
 select count(*) into attempts from tongs.restricted_beta_exposure_events where hold_id=h.id and event_type='attempt_started';
 if p_event_type='released' and attempts>0 and coalesce((p_evidence_json->>'transmitted')::boolean,true) is not false then
  raise exception 'attempted supplier work requires reconciliation' using errcode='P0001'; end if;
 if p_event_type='reconciliation_partial' and (p_supplier_obligation_micros is null or coalesce((p_evidence_json->>'authoritative')::boolean,false) is not true) then
  raise exception 'authoritative partial supplier obligation required' using errcode='P0001'; end if;
 if p_event_type='reconciled' and (p_supplier_obligation_micros is null or coalesce((p_evidence_json->>'authoritative')::boolean,false) is not true) then
  raise exception 'authoritative supplier obligation required for reconciliation' using errcode='P0001'; end if;
 if p_event_type='supplier_recovery' and coalesce(p_supplier_recovery_micros,0)<=0 then
  raise exception 'positive supplier recovery required' using errcode='22023'; end if;
 insert into tongs.restricted_beta_exposure_events(id,hold_id,sequence,event_key,event_type,supplier_obligation_micros,supplier_recovery_micros,customer_funding_delta_micros,forge_loss_delta_micros,evidence_json)
 select extensions.uuid_generate_v5(h.id,p_event_key),h.id,coalesce(max(sequence),0)+1,p_event_key,p_event_type,p_supplier_obligation_micros,p_supplier_recovery_micros,p_customer_funding_delta_micros,p_forge_loss_delta_micros,coalesce(p_evidence_json,'{}'::jsonb)
 from tongs.restricted_beta_exposure_events where hold_id=h.id returning * into existing;
 return to_jsonb(existing)||jsonb_build_object('replay',false);
end $$;

create or replace function tongs._restricted_beta_policy_commitment(p_policy_revision_id uuid)
returns table(committed_micros bigint,outstanding_count bigint)
language sql stable security definer set search_path=pg_catalog as $$
 with policy as (
  select * from tongs.restricted_beta_policy_revisions where id=p_policy_revision_id
 ), facts as (
  select h.*,
   (select e.event_type from tongs.restricted_beta_exposure_events e where e.hold_id=h.id order by e.sequence desc limit 1) last_type,
   (select e.supplier_obligation_micros from tongs.restricted_beta_exposure_events e where e.hold_id=h.id and e.event_type='reconciled' order by e.sequence desc limit 1) reconciled_supplier,
   (select e.created_at from tongs.restricted_beta_exposure_events e where e.hold_id=h.id and e.event_type='attempt_started' order by e.sequence limit 1) incurred_at,
   (select e.supplier_obligation_micros from tongs.restricted_beta_exposure_events e where e.hold_id=h.id and e.event_type='reconciliation_partial' order by e.sequence desc limit 1) partial_supplier,
   (select coalesce(sum(e.supplier_recovery_micros),0) from tongs.restricted_beta_exposure_events e where e.hold_id=h.id and e.event_type='supplier_recovery') recovered
  from tongs.restricted_beta_exposure_holds h where h.policy_revision_id=p_policy_revision_id
 ), amounts as (
  select f.*,
   case
    when f.last_type='released' then 0
    when f.reconciled_supplier is not null then case
      when coalesce(f.incurred_at,f.created_at)>=now()-make_interval(secs=>(select rolling_window_seconds from policy))
      then greatest(f.reconciled_supplier-f.recovered,0) else 0 end
    when f.partial_supplier is not null then
      greatest(f.partial_supplier-f.recovered,0)+f.supporting_exposure_ceiling_micros+f.tail_exposure_ceiling_micros+f.unreconciled_exposure_ceiling_micros+f.retry_exposure_ceiling_micros
    else f.supplier_exposure_ceiling_micros+f.supporting_exposure_ceiling_micros+f.tail_exposure_ceiling_micros+f.unreconciled_exposure_ceiling_micros+f.retry_exposure_ceiling_micros
   end amount,
   case when f.last_type='released' or f.reconciled_supplier is not null then 0 else 1 end outstanding
  from facts f
 )
 select coalesce(sum(amount),0)::bigint,coalesce(sum(outstanding),0)::bigint from amounts;
$$;

create or replace function tongs.reserve_restricted_beta_exposure(
 p_hold_id uuid,p_policy_revision_id uuid,p_capability_code text,p_operation_identity text,
 p_user_id uuid,p_workspace_id uuid,p_request_fingerprint text,p_model_or_sku text,
 p_funding_class text,p_opaque_funding_handle text,p_provider_mode text,p_caller_class text,
 p_customer_funding_ceiling_micros bigint,p_supplier_exposure_ceiling_micros bigint,
 p_supporting_exposure_ceiling_micros bigint,p_tail_exposure_ceiling_micros bigint,
 p_unreconciled_exposure_ceiling_micros bigint,p_retry_exposure_ceiling_micros bigint,
 p_lease_seconds integer,p_event_key text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare pol tongs.restricted_beta_policy_revisions%rowtype; term tongs.restricted_beta_policy_capabilities%rowtype;
 existing tongs.restricted_beta_exposure_holds%rowtype; ev tongs.restricted_beta_cost_evidence_revisions%rowtype;
 requested bigint; committed bigint; concurrent_count bigint;
begin
 perform tongs._require_pricing_service_role();
 select * into pol from tongs.restricted_beta_policy_revisions where id=p_policy_revision_id;
 if not found or pol.lifecycle_state='draft' then return jsonb_build_object('authorized',false,'reason','restricted_beta_inactive'); end if;
 if pol.lifecycle_state<>'active' then return jsonb_build_object('authorized',false,'reason','halt_new'); end if;
 perform pg_advisory_xact_lock(hashtext('restricted-beta:'||pol.environment));
 select * into existing from tongs.restricted_beta_exposure_holds where operation_identity=btrim(p_operation_identity);
 if found then
  if existing.policy_revision_id<>pol.id or existing.request_fingerprint<>lower(p_request_fingerprint)
     or existing.model_or_sku<>p_model_or_sku or existing.user_id is distinct from p_user_id
     or existing.workspace_id is distinct from p_workspace_id then
   raise exception 'operation binding mismatch' using errcode='22023'; end if;
  return jsonb_build_object('authorized',true,'replay',true,'hold_id',existing.id);
 end if;
 select * into term from tongs.restricted_beta_policy_capabilities where policy_revision_id=pol.id and capability_code=p_capability_code;
 if not found or term.admission_mode='block' then return jsonb_build_object('authorized',false,'reason','capability_not_covered'); end if;
 select * into ev from tongs.restricted_beta_cost_evidence_revisions where id=term.cost_evidence_revision_id;
 if not found or ev.coverage_state<>'complete' or ev.evidence_state='unresolved' or ev.valid_until<=now()
    or ev.observed_at < now()-make_interval(secs=>pol.evidence_max_age_seconds) then
  return jsonb_build_object('authorized',false,'reason','cost_evidence_stale_or_incomplete'); end if;
 if p_model_or_sku<>term.exact_model_or_sku then return jsonb_build_object('authorized',false,'reason','model_or_sku_mismatch'); end if;
 if not(term.permitted_callers_json ? p_caller_class) then return jsonb_build_object('authorized',false,'reason','caller_not_permitted'); end if;
 if p_provider_mode='real' and p_funding_class='test_customer' then return jsonb_build_object('authorized',false,'reason','test_funding_real_provider_forbidden'); end if;
 if nullif(btrim(p_opaque_funding_handle),'') is null then return jsonb_build_object('authorized',false,'reason','funding_context_required'); end if;
 if p_supplier_exposure_ceiling_micros>term.per_operation_supplier_ceiling_micros
    or p_supporting_exposure_ceiling_micros>term.per_operation_supporting_ceiling_micros
    or p_tail_exposure_ceiling_micros>term.per_operation_tail_ceiling_micros then
  return jsonb_build_object('authorized',false,'reason','operation_ceiling_exceeded'); end if;
 requested:=p_supplier_exposure_ceiling_micros+p_supporting_exposure_ceiling_micros+p_tail_exposure_ceiling_micros+p_unreconciled_exposure_ceiling_micros+p_retry_exposure_ceiling_micros;
 select c.committed_micros,c.outstanding_count into committed,concurrent_count from tongs._restricted_beta_policy_commitment(pol.id)c;
 if concurrent_count>=pol.maximum_concurrency then return jsonb_build_object('authorized',false,'reason','aggregate_concurrency_exhausted','committed_micros',committed); end if;
 if committed+requested+pol.reserved_headroom_micros>pol.aggregate_forge_exposure_limit_micros then
  return jsonb_build_object('authorized',false,'reason','aggregate_exposure_exhausted','committed_micros',committed,'requested_micros',requested); end if;
 insert into tongs.restricted_beta_exposure_holds(id,policy_revision_id,capability_term_id,operation_identity,user_id,workspace_id,request_fingerprint,model_or_sku,funding_class,funding_handle_hash,provider_mode,caller_class,customer_funding_ceiling_micros,supplier_exposure_ceiling_micros,supporting_exposure_ceiling_micros,tail_exposure_ceiling_micros,unreconciled_exposure_ceiling_micros,retry_exposure_ceiling_micros,lease_expires_at)
 values(p_hold_id,pol.id,term.id,btrim(p_operation_identity),p_user_id,p_workspace_id,lower(p_request_fingerprint),p_model_or_sku,p_funding_class,encode(extensions.digest(convert_to(p_opaque_funding_handle,'utf8'),'sha256'),'hex'),p_provider_mode,p_caller_class,p_customer_funding_ceiling_micros,p_supplier_exposure_ceiling_micros,p_supporting_exposure_ceiling_micros,p_tail_exposure_ceiling_micros,p_unreconciled_exposure_ceiling_micros,p_retry_exposure_ceiling_micros,now()+make_interval(secs=>p_lease_seconds));
 insert into tongs.restricted_beta_exposure_events(id,hold_id,sequence,event_key,event_type,customer_funding_delta_micros,evidence_json)
 values(extensions.uuid_generate_v5(p_hold_id,'reserved'),p_hold_id,1,p_event_key,'reserved',p_customer_funding_ceiling_micros,jsonb_build_object('caller_class',p_caller_class));
 return jsonb_build_object('authorized',true,'replay',false,'hold_id',p_hold_id,'aggregate_before_micros',committed,'reserved_exposure_micros',requested);
end $$;

create or replace function tongs.record_paid_operation_aggregate_outcome(
 p_reservation_id uuid,p_event_key text,p_outcome text,p_supplier_obligation_micros bigint default null,
 p_supplier_recovery_micros bigint default null,p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare b tongs.paid_operation_aggregate_bindings%rowtype; event_type text; loss bigint:=0;
begin
 perform tongs._require_pricing_service_role();
 select * into b from tongs.paid_operation_aggregate_bindings where reservation_id=p_reservation_id;
 if not found then return jsonb_build_object('enforcement_enabled',false,'recorded',false,'reason','aggregate_assignment_inactive'); end if;
 event_type:=case p_outcome when 'preprovider_release' then 'released' when 'ambiguous' then 'ambiguous'
  when 'failure' then 'customer_relieved_supplier_obligation' when 'settled_unconfirmed' then 'settled_unconfirmed'
  when 'reconciled_partial' then 'reconciliation_partial' when 'reconciled' then 'reconciled'
  when 'supplier_recovery' then 'supplier_recovery' else null end;
 if event_type is null then raise exception 'invalid aggregate outcome' using errcode='22023'; end if;
 if p_outcome='failure' then loss:=coalesce(p_supplier_obligation_micros,0); end if;
 return jsonb_build_object('enforcement_enabled',true,'recorded',true)||tongs.record_restricted_beta_exposure_outcome(
  b.hold_id,p_event_key,event_type,p_supplier_obligation_micros,p_supplier_recovery_micros,
  case when p_outcome='failure' then -b.customer_funding_ceiling_micros else 0 end,loss,p_evidence_json);
end $$;

create or replace function tongs.record_openai_supplier_expense_reconciliation_adjustment(
 p_id uuid,p_supplier_expense_id uuid,p_batch_id uuid,p_allocation_id uuid,p_source_key text,
 p_confirmed_amount_micros bigint,p_matching_method text,p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare e tongs.supplier_expenses%rowtype; a tongs.openai_text_operation_cost_allocations%rowtype;
 existing tongs.openai_supplier_expense_reconciliation_adjustments%rowtype;
begin
 perform tongs._require_pricing_service_role();
 select * into existing from tongs.openai_supplier_expense_reconciliation_adjustments where source_key=btrim(p_source_key);
 if found then
  if existing.supplier_expense_id<>p_supplier_expense_id or existing.reconciliation_batch_id<>p_batch_id or existing.confirmed_amount_micros<>p_confirmed_amount_micros then
   raise exception 'OpenAI expense adjustment replay conflict' using errcode='23505'; end if;
  return to_jsonb(existing)||jsonb_build_object('replay',true);
 end if;
 select * into e from tongs.supplier_expenses where id=p_supplier_expense_id;
 select * into a from tongs.openai_text_operation_cost_allocations where id=p_allocation_id and batch_id=p_batch_id;
 if e.id is null or e.provider<>'openai' or a.id is null or a.allocation_status<>'confirmed'
    or a.allocated_cost_micros<>p_confirmed_amount_micros or e.reservation_id<>a.reservation_id
    or tongs._openai_reconciliation_batch_state(p_batch_id)<>'accepted' then
  raise exception 'confirmed defensible effective operation allocation required' using errcode='P0001'; end if;
 insert into tongs.openai_supplier_expense_reconciliation_adjustments(id,supplier_expense_id,reconciliation_batch_id,operation_allocation_id,source_key,estimated_amount_micros,confirmed_amount_micros,adjustment_micros,currency,matching_method,evidence_json)
 values(p_id,e.id,p_batch_id,a.id,btrim(p_source_key),e.amount_micros,p_confirmed_amount_micros,
  p_confirmed_amount_micros-coalesce(e.amount_micros,0),e.currency,p_matching_method,coalesce(p_evidence_json,'{}'::jsonb)) returning * into existing;
 return to_jsonb(existing)||jsonb_build_object('replay',false);
end $$;

create or replace function tongs._process_openai_organization_reconciliation(p_batch_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare ub record; candidate record; candidate_count bigint; candidate_input bigint; candidate_cached bigint;
 candidate_output bigint; distinct_refs bigint; provider_bucket_count bigint; cost_total bigint;
 cost_bucket_count bigint;
 allocation_count bigint:=0; adjustment_total bigint:=0; direct_count bigint; reconciled_direct_count bigint;
 direct_actual bigint; other_incomplete bigint; other_confirmed bigint; aggregate_result jsonb;
begin
 perform tongs._require_pricing_service_role();
 if tongs._openai_reconciliation_batch_state(p_batch_id)<>'accepted' then
  return jsonb_build_object('batch_id',p_batch_id,'effective',false,'allocation_status','overlap_quarantined','automatic_allocations',0);
 end if;
 for ub in select * from tongs.openai_organization_usage_buckets where batch_id=p_batch_id loop
  select count(*) into provider_bucket_count from tongs.openai_organization_usage_buckets x
   where x.batch_id=p_batch_id and x.model is not distinct from ub.model
    and (x.evidence_json->>'start_time')=(ub.evidence_json->>'start_time')
    and (x.evidence_json->>'end_time')=(ub.evidence_json->>'end_time')
    and x.project_id is not distinct from ub.project_id;
  if provider_bucket_count<>1 or ub.model is null or ub.api_key_id is null then continue; end if;
  select count(*),coalesce(sum(c.amount_micros),0) into cost_bucket_count,cost_total from tongs.openai_organization_cost_buckets c
   where c.batch_id=p_batch_id and c.project_id is not distinct from ub.project_id and c.api_key_id is not distinct from ub.api_key_id
    and (c.evidence_json->>'start_time')=(ub.evidence_json->>'start_time')
    and (c.evidence_json->>'end_time')=(ub.evidence_json->>'end_time')
    and btrim(split_part(coalesce(c.line_item,''),',',1))=ub.model;
  if cost_bucket_count=0 then continue; end if;
  select count(*),coalesce(sum(u.input_units),0),
    coalesce(sum(case when (u.evidence_json->>'cached_input_units')~'^[0-9]+$' then (u.evidence_json->>'cached_input_units')::bigint else 0 end),0),
    coalesce(sum(u.output_units),0),count(distinct u.provider_request_id)
  into candidate_count,candidate_input,candidate_cached,candidate_output,distinct_refs
  from tongs.supplier_expenses e
  join tongs.openai_text_funding_bindings b on b.reservation_id=e.reservation_id and b.credential_funding='forge' and b.model=ub.model
  join tongs.openai_text_usage_evidence u on u.reservation_id=e.reservation_id
    and u.attempt_number=coalesce((e.evidence_json->>'attempt_number')::smallint,1) and u.provider_reported
  join tongs.funding_reservations r on r.id=e.reservation_id
  where e.provider='openai' and e.provider_reference is not null and u.provider_request_id=e.provider_reference
    and tongs._aggregate_funding_class(r)<>'test_customer'
    and u.recorded_at>=to_timestamp((ub.evidence_json->>'start_time')::double precision)
    and u.recorded_at<to_timestamp((ub.evidence_json->>'end_time')::double precision);
  if candidate_count=0 or candidate_count<>ub.request_count or distinct_refs<>candidate_count
     or candidate_input<>ub.input_tokens or candidate_cached<>ub.cached_input_tokens or candidate_output<>ub.output_tokens then continue; end if;
  for candidate in
   with candidates as (
    select e.id expense_id,e.reservation_id,e.amount_micros,u.provider_request_id,
      greatest(coalesce(e.amount_micros,0),u.input_units+u.output_units,1)::numeric weight
    from tongs.supplier_expenses e
    join tongs.openai_text_funding_bindings b on b.reservation_id=e.reservation_id and b.credential_funding='forge' and b.model=ub.model
    join tongs.openai_text_usage_evidence u on u.reservation_id=e.reservation_id
      and u.attempt_number=coalesce((e.evidence_json->>'attempt_number')::smallint,1) and u.provider_reported
    join tongs.funding_reservations r on r.id=e.reservation_id
    where e.provider='openai' and e.provider_reference is not null and u.provider_request_id=e.provider_reference
      and tongs._aggregate_funding_class(r)<>'test_customer'
      and u.recorded_at>=to_timestamp((ub.evidence_json->>'start_time')::double precision)
      and u.recorded_at<to_timestamp((ub.evidence_json->>'end_time')::double precision)
   ), weighted as (
    select c.*,sum(weight) over() total_weight,
      sum(weight) over(order by reservation_id rows between unbounded preceding and current row) cumulative_weight,
      coalesce(sum(weight) over(order by reservation_id rows between unbounded preceding and 1 preceding),0) prior_weight
    from candidates c
   )
   select w.*,case when cost_total=0 then 0 else
      floor(cost_total::numeric*cumulative_weight/total_weight)::bigint-floor(cost_total::numeric*prior_weight/total_weight)::bigint end allocated
   from weighted w order by reservation_id
  loop
   insert into tongs.openai_text_operation_cost_allocations(id,reservation_id,batch_id,allocation_key,allocated_cost_micros,allocation_status,allocation_method,evidence_json)
   values(extensions.uuid_generate_v5(p_batch_id,candidate.reservation_id::text),candidate.reservation_id,p_batch_id,
    'openai-allocation:'||p_batch_id::text||':'||candidate.reservation_id::text,candidate.allocated,'confirmed','token_weighted',
    jsonb_build_object('evidence_class','defensible_aggregate_allocation','request_level_cost_match',false,'provider_request_id_used_for_completeness',candidate.provider_request_id,
      'project_id',ub.project_id,'api_key_id',ub.api_key_id,'model',ub.model,'provider_request_count',ub.request_count,
      'provider_usage_totals_exactly_accounted_for',true,'allocation_rule','estimated-cost weight, token fallback, deterministic remainder'))
   on conflict(allocation_key) do nothing;
   perform tongs.record_openai_supplier_expense_reconciliation_adjustment(
    extensions.uuid_generate_v5(p_batch_id,'adjustment:'||candidate.expense_id::text),candidate.expense_id,p_batch_id,
    extensions.uuid_generate_v5(p_batch_id,candidate.reservation_id::text),
    'openai-adjustment:'||p_batch_id::text||':'||candidate.expense_id::text,candidate.allocated,'documented_allocation',
    jsonb_build_object('provider_total_authoritative',true,'operation_amount_is_allocated',true,'request_level_cost_match',false));
   allocation_count:=allocation_count+1;
   adjustment_total:=adjustment_total+(candidate.allocated-coalesce(candidate.amount_micros,0));

   if exists(select 1 from tongs.paid_operation_aggregate_bindings b where b.reservation_id=candidate.reservation_id) then
    select count(*),count(*) filter(where effective.confirmed_amount is not null),coalesce(sum(effective.confirmed_amount),0)
    into direct_count,reconciled_direct_count,direct_actual
    from tongs.supplier_expenses e
    left join lateral(
      select a.confirmed_amount_micros confirmed_amount
      from tongs.openai_supplier_expense_reconciliation_adjustments a
      join tongs.openai_reconciliation_batch_state_events state on state.batch_id=a.reconciliation_batch_id
      where a.supplier_expense_id=e.id and tongs._openai_reconciliation_batch_state(a.reconciliation_batch_id)='accepted'
      order by a.created_at desc limit 1
    ) effective on true
    where e.reservation_id=candidate.reservation_id and e.provider='openai';
    if direct_count>0 and direct_count=reconciled_direct_count then
     select count(*) filter(where evidence_status<>'confirmed' or amount_micros is null),coalesce(sum(amount_micros) filter(where evidence_status='confirmed'),0)
     into other_incomplete,other_confirmed from tongs.supplier_expenses e
     where e.reservation_id=candidate.reservation_id and e.provider<>'openai';
     if other_incomplete=0 then
      aggregate_result:=tongs.record_paid_operation_aggregate_outcome(candidate.reservation_id,
       'openai-reconciliation:'||p_batch_id::text||':'||candidate.reservation_id::text||':complete','reconciled',direct_actual+other_confirmed,null,
       jsonb_build_object('authoritative',true,'provider','openai','batch_id',p_batch_id,'direct_provider_allocated',true,'supporting_costs_confirmed',true));
     else
      aggregate_result:=tongs.record_paid_operation_aggregate_outcome(candidate.reservation_id,
       'openai-reconciliation:'||p_batch_id::text||':'||candidate.reservation_id::text||':partial','reconciled_partial',direct_actual,null,
       jsonb_build_object('authoritative',true,'provider','openai','batch_id',p_batch_id,'direct_provider_allocated',true,'supporting_costs_confirmed',false));
     end if;
    end if;
   end if;
  end loop;
 end loop;
 return jsonb_build_object('batch_id',p_batch_id,'effective',true,'allocation_status',case when allocation_count>0 then 'defensibly_allocated' else 'unresolved' end,
  'automatic_allocations',allocation_count,'estimate_replacement_adjustment_micros',adjustment_total);
end $$;

create or replace function tongs.record_openai_organization_reconciliation(
 p_batch_id uuid,p_source_key text,p_period_start timestamptz,p_period_end timestamptz,
 p_currency text,p_total_cost_micros bigint,p_source_kind text,p_evidence_status text,
 p_cost_buckets jsonb,p_usage_buckets jsonb,p_raw_evidence_json jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare existing tongs.openai_organization_reconciliation_batches%rowtype; prior record; cost_sum bigint;
 overlap_count bigint; incompatible_overlap_count bigint;
 v_scope_key text; new_state text:='accepted'; state_reason text:='Non-overlapping provider evidence accepted.'; result jsonb;
begin
 perform tongs._require_pricing_service_role();
 if p_batch_id is null or length(btrim(coalesce(p_source_key,'')))<8 or p_period_end<=p_period_start
    or upper(btrim(coalesce(p_currency,'')))<>'USD' or p_total_cost_micros<0
    or p_source_kind not in ('organization_costs_api','provider_invoice') or p_evidence_status not in ('confirmed','incomplete')
    or jsonb_typeof(coalesce(p_cost_buckets,'null'::jsonb))<>'array' or jsonb_typeof(coalesce(p_usage_buckets,'null'::jsonb))<>'array'
    or jsonb_typeof(coalesce(p_raw_evidence_json,'null'::jsonb))<>'object' then
  raise exception 'invalid OpenAI reconciliation batch' using errcode='22023'; end if;
 select coalesce(sum((item->>'amount_micros')::bigint),0) into cost_sum from jsonb_array_elements(p_cost_buckets)item;
 if cost_sum<>p_total_cost_micros then raise exception 'OpenAI cost bucket total mismatch' using errcode='22023'; end if;
 v_scope_key:=tongs._openai_reconciliation_scope_key(p_source_kind,upper(p_currency),p_raw_evidence_json);
 perform pg_advisory_xact_lock(hashtextextended('openai-reconciliation-scope:'||v_scope_key,0));
 select * into existing from tongs.openai_organization_reconciliation_batches where source_key=btrim(p_source_key);
 if found then
  if existing.total_cost_micros<>p_total_cost_micros or existing.period_start<>p_period_start or existing.period_end<>p_period_end then
   raise exception 'OpenAI reconciliation replay conflict' using errcode='23505'; end if;
  result:=tongs._process_openai_organization_reconciliation(existing.id);
  return result||jsonb_build_object('replay',true);
 end if;
 insert into tongs.openai_organization_reconciliation_batches(id,source_key,period_start,period_end,currency,total_cost_micros,source_kind,evidence_status,raw_evidence_json)
 values(p_batch_id,btrim(p_source_key),p_period_start,p_period_end,'USD',p_total_cost_micros,p_source_kind,p_evidence_status,p_raw_evidence_json);
 insert into tongs.openai_organization_cost_buckets(id,batch_id,bucket_key,project_id,api_key_id,line_item,amount_micros,evidence_json)
 select gen_random_uuid(),p_batch_id,btrim(item->>'bucket_key'),nullif(btrim(coalesce(item->>'project_id','')),''),nullif(btrim(coalesce(item->>'api_key_id','')),''),
  nullif(btrim(coalesce(item->>'line_item','')),''),(item->>'amount_micros')::bigint,coalesce(item->'evidence','{}'::jsonb) from jsonb_array_elements(p_cost_buckets)item;
 insert into tongs.openai_organization_usage_buckets(id,batch_id,bucket_key,model,project_id,api_key_id,input_tokens,cached_input_tokens,output_tokens,request_count,evidence_json)
 select gen_random_uuid(),p_batch_id,btrim(item->>'bucket_key'),nullif(btrim(coalesce(item->>'model','')),''),nullif(btrim(coalesce(item->>'project_id','')),''),nullif(btrim(coalesce(item->>'api_key_id','')),''),
  coalesce((item->>'input_tokens')::bigint,0),coalesce((item->>'cached_input_tokens')::bigint,0),coalesce((item->>'output_tokens')::bigint,0),coalesce((item->>'request_count')::bigint,0),coalesce(item->'evidence','{}'::jsonb)
 from jsonb_array_elements(p_usage_buckets)item;

 select count(*),count(*) filter(where not(p_evidence_status='confirmed' and p_period_start<=b.period_start and p_period_end>=b.period_end))
 into overlap_count,incompatible_overlap_count
 from tongs.openai_organization_reconciliation_batches b
 where b.id<>p_batch_id and tongs._openai_reconciliation_scope_key(b.source_kind,b.currency,b.raw_evidence_json)=v_scope_key
   and tongs._openai_reconciliation_batch_state(b.id)='accepted' and tstzrange(b.period_start,b.period_end,'[)')&&tstzrange(p_period_start,p_period_end,'[)');
 if incompatible_overlap_count>0 then
  new_state:='overlap_quarantined'; state_reason:='Overlapping evidence did not fully and authoritatively supersede every effective window; excluded from totals and allocations.';
 elsif overlap_count>0 then
  state_reason:='Confirmed provider evidence accepted; fully contained earlier windows were superseded append-only.';
 end if;
 for prior in
  select b.* from tongs.openai_organization_reconciliation_batches b
  where b.id<>p_batch_id and tongs._openai_reconciliation_scope_key(b.source_kind,b.currency,b.raw_evidence_json)=v_scope_key
    and tongs._openai_reconciliation_batch_state(b.id)='accepted' and tstzrange(b.period_start,b.period_end,'[)')&&tstzrange(p_period_start,p_period_end,'[)')
 loop
  if new_state='accepted' then
   insert into tongs.openai_reconciliation_batch_state_events(id,batch_id,sequence,event_key,state,related_batch_id,scope_key,reason)
   select extensions.uuid_generate_v5(prior.id,'superseded-by:'||p_batch_id::text),prior.id,coalesce(max(sequence),0)+1,
    'openai-reconciliation:'||prior.id::text||':superseded-by:'||p_batch_id::text,'superseded',p_batch_id,v_scope_key,
    'A confirmed provider window with the same scope fully contains this earlier window.'
   from tongs.openai_reconciliation_batch_state_events where batch_id=prior.id;
  end if;
 end loop;
 insert into tongs.openai_reconciliation_batch_state_events(id,batch_id,sequence,event_key,state,scope_key,reason)
 values(extensions.uuid_generate_v5(p_batch_id,'reconciliation-state:'||new_state),p_batch_id,1,
  'openai-reconciliation:'||p_batch_id::text||':'||new_state,new_state,v_scope_key,state_reason);
 result:=tongs._process_openai_organization_reconciliation(p_batch_id);
 return result||jsonb_build_object('replay',false,'batch_state',new_state,'note',state_reason);
end $$;

create or replace function tongs.read_openai_reconciliation_summary()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare source_total bigint; allocated bigint; adjustment bigint; estimate_total bigint; unresolved_estimate bigint;
 unresolved_expenses bigint; raw_batches bigint; effective_batches bigint; superseded_batches bigint; quarantined_batches bigint;
 incomplete_batches bigint; unresolved_batches bigint; historical_unresolved bigint;
begin
 if coalesce(auth.role(),'')<>'service_role' and not tongs.is_platform_operator(auth.uid()) then
  raise exception 'platform operator required' using errcode='42501'; end if;
 select count(*),count(*) filter(where tongs._openai_reconciliation_batch_state(id)='accepted'),
  count(*) filter(where tongs._openai_reconciliation_batch_state(id)='superseded'),count(*) filter(where tongs._openai_reconciliation_batch_state(id)='overlap_quarantined'),
  count(*) filter(where evidence_status='incomplete' and tongs._openai_reconciliation_batch_state(id)='accepted'),
  coalesce(sum(total_cost_micros) filter(where tongs._openai_reconciliation_batch_state(id)='accepted'),0)
 into raw_batches,effective_batches,superseded_batches,quarantined_batches,incomplete_batches,source_total
 from tongs.openai_organization_reconciliation_batches;
 select count(*) into unresolved_batches from tongs.openai_organization_reconciliation_batches b
 where tongs._openai_reconciliation_batch_state(b.id)='accepted'
   and coalesce((select sum(a.allocated_cost_micros) from tongs.openai_text_operation_cost_allocations a
     where a.batch_id=b.id and a.allocation_status='confirmed'),0)<b.total_cost_micros;
 select coalesce(sum(a.allocated_cost_micros),0) into allocated from tongs.openai_text_operation_cost_allocations a
 where a.allocation_status='confirmed' and tongs._openai_reconciliation_batch_state(a.batch_id)='accepted';
 select coalesce(sum(a.adjustment_micros),0) into adjustment from tongs.openai_supplier_expense_reconciliation_adjustments a
 where tongs._openai_reconciliation_batch_state(a.reconciliation_batch_id)='accepted';
 select coalesce(sum(coalesce(e.amount_micros,0)) filter(where e.evidence_status='estimated'),0),
  coalesce(sum(coalesce(e.amount_micros,0)) filter(where e.evidence_status='estimated' and not exists(
    select 1 from tongs.openai_supplier_expense_reconciliation_adjustments a where a.supplier_expense_id=e.id and tongs._openai_reconciliation_batch_state(a.reconciliation_batch_id)='accepted')),0),
  count(*) filter(where e.evidence_status='unresolved' and not exists(
    select 1 from tongs.openai_supplier_expense_reconciliation_adjustments a where a.supplier_expense_id=e.id and tongs._openai_reconciliation_batch_state(a.reconciliation_batch_id)='accepted'))
 into estimate_total,unresolved_estimate,unresolved_expenses from tongs.supplier_expenses e where e.provider='openai';
 select coalesce(sum(amount_micros),0) into historical_unresolved from tongs.openai_historical_unmatched_cost_estimates where resolution_state='unresolved';
 return jsonb_build_object(
  'authoritative_provider_total_micros',source_total,'usage_based_operation_estimate_micros',estimate_total,
  'defensibly_allocated_micros',allocated,'estimate_replacement_adjustment_micros',adjustment,
  'unmatched_authoritative_micros',greatest(source_total-allocated,0),'unresolved_operation_estimate_micros',unresolved_estimate,
  'unresolved_operation_count',unresolved_expenses,'raw_batch_count',raw_batches,'effective_batch_count',effective_batches,
  'historical_unmatched_estimate_micros',historical_unresolved,'historical_estimate_potential_overlap',historical_unresolved>0,
  'superseded_batch_count',superseded_batches,'quarantined_batch_count',quarantined_batches,'incomplete_effective_batch_count',incomplete_batches,
  'source_total_micros',source_total,'matched_micros',allocated,'unresolved_source_micros',greatest(source_total-allocated,0),
  'batch_count',effective_batches,'unresolved_batches',unresolved_batches,
  'source_granularity','Organization-credential scope; project/API-key/model/day Usage and project/API-key/line-item/day Costs. Costs and Usage expose no request identifier join.',
  'matching_rule','Automatic allocation requires one provider API-key bucket and exact complete equality of request count, input, cached input, and output totals. Allocated operation amounts are not request-level provider costs.');
end $$;

-- Apply only the adjustment attached to the currently effective provider
-- batch. The original supplier row remains immutable and auditable.
create or replace function tongs.read_failure_financials(p_limit integer default 250)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare actor uuid:=auth.uid(); lim integer:=least(greatest(coalesce(p_limit,250),1),2000);
begin
 if coalesce(auth.role(),'')<>'service_role' and (actor is null or not tongs.is_platform_operator(actor)) then
  raise exception 'platform operator required' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) from (
  select r.id reservation_id,r.operation_id,r.user_id,r.funding_source_type,r.currency,
   coalesce(s.customer_charge_micros,0) gross_customer_charge_micros,
   coalesce(rel.revenue_reversal_micros,0) revenue_reversal_micros,
   coalesce(s.customer_charge_micros,0)-coalesce(rel.revenue_reversal_micros,0) recognized_revenue_micros,
   expenses.effective_amount_micros supplier_expense_micros,expenses.evidence_status supplier_expense_status,
   expenses.obligation_status,coalesce(expenses.confirmed_recovery_micros,0) confirmed_supplier_recovery_micros,
   case when expenses.coverage in ('confirmed','allocated_authoritative') then
    coalesce(s.customer_charge_micros,0)-coalesce(rel.revenue_reversal_micros,0)-expenses.effective_amount_micros+coalesce(expenses.confirmed_recovery_micros,0)
   else null end contribution_profit_micros,
   case when coalesce(expenses.expense_count,0)=0 then 'missing' else expenses.coverage end cost_coverage,r.created_at
  from tongs.funding_reservations r
  left join lateral(select customer_charge_micros from tongs.funding_reservation_events where reservation_id=r.id and event_type='settled' order by sequence desc limit 1)s on true
  left join tongs.customer_operation_reliefs rel on rel.reservation_id=r.id
  left join lateral(
   with effective as (
    select e.*,
     adjustment.confirmed_amount_micros allocated_amount,
     coalesce(adjustment.confirmed_amount_micros,e.amount_micros) effective_amount,
     exists(select 1 from tongs.openai_supplier_expense_reconciliation_adjustments a
       where a.supplier_expense_id=e.id and tongs._openai_reconciliation_batch_state(a.reconciliation_batch_id)='accepted') has_allocation,
     coalesce((select sum(sr.amount_micros) from tongs.supplier_recoveries sr where sr.supplier_expense_id=e.id and sr.evidence_status='confirmed'),0) recovery
    from tongs.supplier_expenses e
    left join lateral(
     select a.confirmed_amount_micros from tongs.openai_supplier_expense_reconciliation_adjustments a
     where a.supplier_expense_id=e.id and tongs._openai_reconciliation_batch_state(a.reconciliation_batch_id)='accepted'
     order by a.created_at desc limit 1
    )adjustment on true where e.reservation_id=r.id
   )
   select count(*) expense_count,
    case when count(*) filter(where effective_amount is null)>0 then null else sum(effective_amount)::bigint end effective_amount_micros,
    case when count(*) filter(where effective_amount is null or (evidence_status<>'confirmed' and not has_allocation))>0 then 'incomplete'
      when bool_or(has_allocation) then 'allocated_authoritative' else 'confirmed' end evidence_status,
    case when count(*) filter(where obligation_status='unresolved')>0 then 'unresolved'
      when count(*) filter(where obligation_status='open')>0 then 'open' else 'closed' end obligation_status,
    sum(recovery)::bigint confirmed_recovery_micros,
    case when count(*) filter(where effective_amount is null or (evidence_status<>'confirmed' and not has_allocation))>0 then 'incomplete'
      when bool_or(has_allocation) then 'allocated_authoritative' else 'confirmed' end coverage
   from effective
  )expenses on true
  order by r.created_at desc limit lim
 )x);
end $$;

revoke all on function tongs._openai_reconciliation_scope_key(text,text,jsonb) from public,anon,authenticated;
revoke all on function tongs._openai_reconciliation_batch_state(uuid) from public,anon,authenticated;
revoke all on function tongs._restricted_beta_policy_commitment(uuid) from public,anon,authenticated;
revoke all on function tongs._process_openai_organization_reconciliation(uuid) from public,anon,authenticated;
revoke all on function tongs.record_openai_organization_reconciliation(uuid,text,timestamptz,timestamptz,text,bigint,text,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
revoke all on function tongs.read_openai_reconciliation_summary() from public,anon,authenticated;
revoke all on function tongs.read_failure_financials(integer) from public,anon;
grant execute on function tongs.record_openai_organization_reconciliation(uuid,text,timestamptz,timestamptz,text,bigint,text,text,jsonb,jsonb,jsonb) to service_role;
grant execute on function tongs.read_openai_reconciliation_summary() to authenticated,service_role;
grant execute on function tongs.read_failure_financials(integer) to authenticated,service_role;
grant execute on function tongs._openai_reconciliation_batch_state(uuid) to service_role;
grant execute on function tongs._restricted_beta_policy_commitment(uuid) to service_role;
grant execute on function tongs._process_openai_organization_reconciliation(uuid) to service_role;

comment on table tongs.openai_reconciliation_batch_state_events is 'Append-only overlap/revision authority. Only latest accepted batches contribute to authoritative OpenAI totals.';
comment on table tongs.openai_historical_unmatched_cost_estimates is 'Owner-only unresolved historical estimates. They are never added to authoritative totals because overlap and request provenance are unknown.';
comment on function tongs._process_openai_organization_reconciliation(uuid) is 'Connected ingestion processor: exact aggregate completeness permits a documented allocation, estimate-replacement adjustment, and aggregate-exposure update; ambiguous evidence stays unmatched.';
comment on function tongs._restricted_beta_policy_commitment(uuid) is 'Counts unresolved ceilings regardless of lease/window age and reconciled actual supplier spend only inside its applicable rolling window.';

notify pgrst,'reload schema';
commit;
