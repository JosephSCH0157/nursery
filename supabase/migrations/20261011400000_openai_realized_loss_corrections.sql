-- Keep conservative admission ceilings separate from realized supplier loss.
-- Historical facts remain immutable; corrections append a replacement
-- projection while retaining each failure event's original window timestamp.
begin;

create table tongs.openai_text_failure_realized_loss_corrections (
  id uuid primary key,
  correction_key text not null unique check(length(btrim(correction_key)) between 8 and 240),
  failure_event_id uuid not null references tongs.openai_text_failure_exposure_events(id) on delete restrict,
  revision integer not null check(revision>0),
  financial_environment text not null check(financial_environment in('test','live')),
  direct_supplier_cost_micros bigint not null check(direct_supplier_cost_micros>=0),
  direct_cost_status text not null check(direct_cost_status in('estimated','authoritative')),
  attributable_variable_supporting_cost_micros bigint not null
    check(attributable_variable_supporting_cost_micros>=0),
  supporting_cost_status text not null
    check(supporting_cost_status in('verified','none_verified')),
  excluded_nonrealized_cost_micros bigint not null check(excluded_nonrealized_cost_micros>=0),
  corrected_realized_loss_micros bigint generated always as
    (direct_supplier_cost_micros+attributable_variable_supporting_cost_micros) stored,
  correction_kind text not null check(correction_kind in('classification_correction','provider_reconciliation')),
  evidence_json jsonb not null default '{}'::jsonb check(jsonb_typeof(evidence_json)='object'),
  actor_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(failure_event_id,revision)
);

create index openai_text_failure_realized_loss_corrections_latest_idx
  on tongs.openai_text_failure_realized_loss_corrections(failure_event_id,revision desc);

alter table tongs.openai_text_failure_realized_loss_corrections enable row level security;
alter table tongs.openai_text_failure_realized_loss_corrections force row level security;
revoke all on tongs.openai_text_failure_realized_loss_corrections
  from public,anon,authenticated,service_role;
grant select on tongs.openai_text_failure_realized_loss_corrections to service_role;
create trigger openai_text_failure_realized_loss_corrections_immutable
before update or delete on tongs.openai_text_failure_realized_loss_corrections
for each row execute function tongs._reject_accounting_mutation();

create or replace function tongs.record_openai_text_failure_realized_loss_correction(
  p_correction_id uuid,p_correction_key text,p_failure_event_id uuid,
  p_financial_environment text,p_direct_supplier_cost_micros bigint,
  p_direct_cost_status text,p_attributable_variable_supporting_cost_micros bigint,
  p_supporting_cost_status text,p_excluded_nonrealized_cost_micros bigint,
  p_correction_kind text,p_evidence_json jsonb,p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  event_row tongs.openai_text_failure_exposure_events%rowtype;
  reservation_environment text;
  existing tongs.openai_text_failure_realized_loss_corrections%rowtype;
  next_revision integer;
begin
  perform tongs._require_pricing_service_role();
  if p_correction_id is null or p_failure_event_id is null or p_actor_id is null
    or not tongs.is_platform_operator(p_actor_id)
    or length(btrim(coalesce(p_correction_key,''))) not between 8 and 240
    or p_financial_environment not in('test','live')
    or p_direct_supplier_cost_micros<0
    or p_direct_cost_status not in('estimated','authoritative')
    or p_attributable_variable_supporting_cost_micros<0
    or p_supporting_cost_status not in('verified','none_verified')
    or p_excluded_nonrealized_cost_micros<0
    or p_correction_kind not in('classification_correction','provider_reconciliation')
    or jsonb_typeof(coalesce(p_evidence_json,'null'::jsonb))<>'object' then
    raise exception 'invalid realized-loss correction' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'openai-realized-loss-correction:'||p_failure_event_id::text,0));
  select * into existing from tongs.openai_text_failure_realized_loss_corrections
    where correction_key=btrim(p_correction_key) or id=p_correction_id;
  if found then
    if existing.id<>p_correction_id or existing.failure_event_id<>p_failure_event_id
      or existing.financial_environment<>p_financial_environment
      or existing.direct_supplier_cost_micros<>p_direct_supplier_cost_micros
      or existing.direct_cost_status<>p_direct_cost_status
      or existing.attributable_variable_supporting_cost_micros<>p_attributable_variable_supporting_cost_micros
      or existing.supporting_cost_status<>p_supporting_cost_status
      or existing.excluded_nonrealized_cost_micros<>p_excluded_nonrealized_cost_micros
      or existing.correction_kind<>p_correction_kind then
      raise exception 'realized-loss correction idempotency conflict' using errcode='23505';
    end if;
    return to_jsonb(existing)||jsonb_build_object('replay',true);
  end if;
  select exposure_event.* into event_row
  from tongs.openai_text_failure_exposure_events exposure_event
  where exposure_event.id=p_failure_event_id and exposure_event.event_type='failure_realized';
  if event_row.id is null then
    raise exception 'failure-realized event required' using errcode='P0002';
  end if;
  select reservation.funding_environment into reservation_environment
  from tongs.openai_text_failure_exposure_holds exposure_hold
  join tongs.funding_reservations reservation on reservation.id=exposure_hold.reservation_id
  where exposure_hold.id=event_row.hold_id;
  if reservation_environment is distinct from p_financial_environment then
    raise exception 'correction financial environment mismatch' using errcode='42501';
  end if;
  select coalesce(max(revision),0)+1 into next_revision
  from tongs.openai_text_failure_realized_loss_corrections
  where failure_event_id=p_failure_event_id;
  insert into tongs.openai_text_failure_realized_loss_corrections(
    id,correction_key,failure_event_id,revision,financial_environment,
    direct_supplier_cost_micros,direct_cost_status,
    attributable_variable_supporting_cost_micros,supporting_cost_status,
    excluded_nonrealized_cost_micros,correction_kind,evidence_json,actor_id
  ) values(
    p_correction_id,btrim(p_correction_key),p_failure_event_id,next_revision,
    p_financial_environment,p_direct_supplier_cost_micros,p_direct_cost_status,
    p_attributable_variable_supporting_cost_micros,p_supporting_cost_status,
    p_excluded_nonrealized_cost_micros,p_correction_kind,p_evidence_json,p_actor_id
  ) returning * into existing;
  return to_jsonb(existing)||jsonb_build_object('replay',false);
end $$;

do $$
declare actor uuid;
begin
  select user_id into actor from tongs.platform_operators order by granted_at limit 1;
  if actor is null then raise exception 'platform operator required for realized-loss corrections'; end if;
  insert into tongs.openai_text_failure_realized_loss_corrections(
    id,correction_key,failure_event_id,revision,financial_environment,
    direct_supplier_cost_micros,direct_cost_status,
    attributable_variable_supporting_cost_micros,supporting_cost_status,
    excluded_nonrealized_cost_micros,correction_kind,evidence_json,actor_id
  ) values
  (
    'f1000000-0000-4000-8000-000000000001',
    'hearth-chat-realized-loss:bafff750-6322-413c-bd6f-c5870e34190f:r1',
    'bafff750-6322-413c-bd6f-c5870e34190f',1,'test',631,'estimated',0,
    'none_verified',10000,'classification_correction',
    '{"original_recorded_micros":10631,"direct_supplier_micros":631,"excluded_component":"fixed_supporting_allocation","original_event_unchanged":true}',actor
  ),
  (
    'f1000000-0000-4000-8000-000000000002',
    'hearth-chat-realized-loss:a0098b15-f9c1-4fef-b55f-a7341cd8ba6e:r1',
    'a0098b15-f9c1-4fef-b55f-a7341cd8ba6e',1,'test',96,'estimated',0,
    'none_verified',10000,'classification_correction',
    '{"original_recorded_micros":10096,"direct_supplier_micros":96,"excluded_component":"fixed_supporting_allocation","original_event_unchanged":true}',actor
  );
end $$;

create or replace function tongs._openai_text_failure_loss_exposure(
  p_route_code text,p_financial_environment text,p_rolling_window_seconds integer
) returns table(committed_micros bigint,concurrency_count integer)
language sql stable security definer set search_path=pg_catalog as $$
  with latest as(
    select distinct on(exposure_hold.id)
      exposure_hold.id,exposure_hold.authorized_exposure_micros,
      exposure_event.id event_id,exposure_event.event_type,
      coalesce(correction.corrected_realized_loss_micros,
        exposure_event.actual_supplier_cost_micros) actual_supplier_cost_micros,
      exposure_event.created_at
    from tongs.openai_text_failure_exposure_holds exposure_hold
    join tongs.funding_reservations exposure_reservation
      on exposure_reservation.id=exposure_hold.reservation_id
    join tongs.openai_text_failure_exposure_events exposure_event
      on exposure_event.hold_id=exposure_hold.id
    left join lateral(
      select corrected.corrected_realized_loss_micros
      from tongs.openai_text_failure_realized_loss_corrections corrected
      where corrected.failure_event_id=exposure_event.id
        and corrected.financial_environment=p_financial_environment
      order by corrected.revision desc limit 1
    ) correction on true
    where exposure_hold.route_code=btrim(p_route_code)
      and exposure_reservation.funding_environment=p_financial_environment
    order by exposure_hold.id,exposure_event.sequence desc
  )
  select
    coalesce(sum(case
      when event_type in('authorized','unresolved') then authorized_exposure_micros
      when event_type='failure_realized'
        and created_at>=now()-make_interval(secs=>p_rolling_window_seconds)
        then coalesce(actual_supplier_cost_micros,authorized_exposure_micros)
      else 0 end),0)::bigint,
    count(*) filter(where event_type in('authorized','unresolved'))::integer
  from latest
$$;

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
   coalesce(loss.corrected_realized_loss_micros,expenses.effective_amount_micros) supplier_expense_micros,
   case when loss.id is not null then 'corrected_'||loss.direct_cost_status else expenses.evidence_status end supplier_expense_status,
   expenses.obligation_status,coalesce(expenses.confirmed_recovery_micros,0) confirmed_supplier_recovery_micros,
   case when loss.id is not null and loss.direct_cost_status='authoritative' then
      coalesce(s.customer_charge_micros,0)-coalesce(rel.revenue_reversal_micros,0)-loss.corrected_realized_loss_micros+coalesce(expenses.confirmed_recovery_micros,0)
    when loss.id is null and expenses.coverage in('confirmed','allocated_authoritative') then
      coalesce(s.customer_charge_micros,0)-coalesce(rel.revenue_reversal_micros,0)-expenses.effective_amount_micros+coalesce(expenses.confirmed_recovery_micros,0)
    else null end contribution_profit_micros,
   case when loss.id is not null then 'corrected_'||loss.direct_cost_status
    when coalesce(expenses.expense_count,0)=0 then 'missing' else expenses.coverage end cost_coverage,
   loss.excluded_nonrealized_cost_micros,r.created_at
  from tongs.funding_reservations r
  left join lateral(select customer_charge_micros from tongs.funding_reservation_events where reservation_id=r.id and event_type='settled' order by sequence desc limit 1)s on true
  left join lateral(
   select greatest(coalesce(sum(net.gross_revenue_reversal_micros),0)-coalesce(sum(net.corrected_revenue_micros),0),0)::bigint revenue_reversal_micros
   from (select relief.revenue_reversal_micros gross_revenue_reversal_micros,
      coalesce((select sum(correction.corrected_revenue_micros) from tongs.customer_operation_relief_corrections correction where correction.relief_id=relief.id),0) corrected_revenue_micros
     from tongs.customer_operation_reliefs relief where relief.reservation_id=r.id) net
  ) rel on true
  left join lateral(
   select correction.* from tongs.openai_text_failure_realized_loss_corrections correction
   join tongs.openai_text_failure_exposure_events event on event.id=correction.failure_event_id
   join tongs.openai_text_failure_exposure_holds hold on hold.id=event.hold_id
   where hold.reservation_id=r.id order by correction.revision desc limit 1
  ) loss on true
  left join lateral(
   with effective as(
    select e.*,adjustment.confirmed_amount_micros allocated_amount,
     coalesce(adjustment.confirmed_amount_micros,e.amount_micros) effective_amount,
     exists(select 1 from tongs.openai_supplier_expense_reconciliation_adjustments a where a.supplier_expense_id=e.id and tongs._openai_reconciliation_batch_state(a.reconciliation_batch_id)='accepted') has_allocation,
     coalesce((select sum(sr.amount_micros) from tongs.supplier_recoveries sr where sr.supplier_expense_id=e.id and sr.evidence_status='confirmed'),0) recovery
    from tongs.supplier_expenses e
    left join lateral(select a.confirmed_amount_micros from tongs.openai_supplier_expense_reconciliation_adjustments a where a.supplier_expense_id=e.id and tongs._openai_reconciliation_batch_state(a.reconciliation_batch_id)='accepted' order by a.created_at desc limit 1)adjustment on true
    where e.reservation_id=r.id
   )
   select count(*) expense_count,
    case when count(*) filter(where effective_amount is null)>0 then null else sum(effective_amount)::bigint end effective_amount_micros,
    case when count(*) filter(where effective_amount is null or(evidence_status<>'confirmed' and not has_allocation))>0 then 'incomplete' when bool_or(has_allocation) then 'allocated_authoritative' else 'confirmed' end evidence_status,
    case when count(*) filter(where obligation_status='unresolved')>0 then 'unresolved' when count(*) filter(where obligation_status='open')>0 then 'open' else 'closed' end obligation_status,
    sum(recovery)::bigint confirmed_recovery_micros,
    case when count(*) filter(where effective_amount is null or(evidence_status<>'confirmed' and not has_allocation))>0 then 'incomplete' when bool_or(has_allocation) then 'allocated_authoritative' else 'confirmed' end coverage
   from effective
  )expenses on true
  order by r.created_at desc limit lim
 )x);
end $$;

revoke all on function tongs.record_openai_text_failure_realized_loss_correction(uuid,text,uuid,text,bigint,text,bigint,text,bigint,text,jsonb,uuid)
  from public,anon,authenticated;
grant execute on function tongs.record_openai_text_failure_realized_loss_correction(uuid,text,uuid,text,bigint,text,bigint,text,bigint,text,jsonb,uuid)
  to service_role;
revoke all on function tongs._openai_text_failure_loss_exposure(text,text,integer)
  from public,anon,authenticated;
grant execute on function tongs._openai_text_failure_loss_exposure(text,text,integer) to service_role;

comment on table tongs.openai_text_failure_realized_loss_corrections is
  'Append-only effective-cost revisions. Original failure events and their timestamps remain immutable; latest correction replaces only the realized-loss projection.';
comment on function tongs.record_openai_text_failure_realized_loss_correction(uuid,text,uuid,text,bigint,text,bigint,text,bigint,text,jsonb,uuid) is
  'Appends a Test/Live-isolated realized-loss revision; later authoritative provider reconciliation replaces the estimate in projection without adding a second loss.';

notify pgrst,'reload schema';
commit;
