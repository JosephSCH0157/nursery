begin;

alter table tongs.unified_visual_plan_operations
  drop constraint unified_visual_plan_operations_state_check;
alter table tongs.unified_visual_plan_operations
  add constraint unified_visual_plan_operations_state_check check(state in(
    'pending','provider_completed','image_plan_committed','broll_plan_committed',
    'reference_plan_committed','verified','failed','submission_unknown'
  ));

create table tongs.unified_visual_plan_transport_recovery_events(
  id uuid primary key,
  event_key text not null unique check(length(btrim(event_key)) between 8 and 300),
  operation_id text not null references tongs.unified_visual_plan_operations(operation_id) on delete restrict,
  reservation_id uuid not null references tongs.funding_reservations(id) on delete restrict,
  failure_exposure_hold_id uuid not null references tongs.openai_text_failure_exposure_holds(id) on delete restrict,
  event_type text not null check(event_type='expired_attempt_submission_unknown'),
  evidence_json jsonb not null check(jsonb_typeof(evidence_json)='object'),
  created_at timestamptz not null default now()
);
alter table tongs.unified_visual_plan_transport_recovery_events enable row level security;
alter table tongs.unified_visual_plan_transport_recovery_events force row level security;
revoke all on tongs.unified_visual_plan_transport_recovery_events from public,anon,authenticated,service_role;
grant select on tongs.unified_visual_plan_transport_recovery_events to service_role;
create trigger unified_visual_plan_transport_recovery_events_immutable
before update or delete on tongs.unified_visual_plan_transport_recovery_events
for each row execute function tongs._reject_accounting_mutation();

create or replace function tongs.mark_unified_visual_plan_submission_unknown(
  p_operation_id text,p_operation_fingerprint text,p_reservation_id uuid,p_evidence_json jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  op tongs.unified_visual_plan_operations%rowtype;
  binding tongs.openai_text_funding_bindings%rowtype;
begin
  perform tongs._require_pricing_service_role();
  if jsonb_typeof(coalesce(p_evidence_json,'null'::jsonb))<>'object' then
    raise exception 'invalid unified Visual Plan transport evidence' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('unified-visual-plan-transport:'||btrim(p_operation_id),0));
  select * into op from tongs.unified_visual_plan_operations
    where operation_id=btrim(p_operation_id) for update;
  select * into binding from tongs.openai_text_funding_bindings
    where operation_id=btrim(p_operation_id) and reservation_id=p_reservation_id
      and route_code='visual.unified_plan';
  if op.operation_id is null or op.operation_fingerprint is distinct from p_operation_fingerprint
    or binding.reservation_id is null or binding.model<>'gpt-5.6-luna'
    or binding.maximum_attempts<>1 then
    raise exception 'invalid unified Visual Plan transport identity' using errcode='22023';
  end if;
  if op.state='submission_unknown' then
    return jsonb_build_object('disposition','submission_unknown_replay','operation',to_jsonb(op),
      'automatic_resubmission_allowed',false);
  end if;
  if op.state in('verified','failed') then
    return jsonb_build_object('disposition','terminal_operation_conflict','operation',to_jsonb(op));
  end if;
  update tongs.unified_visual_plan_operations
  set state='submission_unknown',failed_stage='provider_transport',
      failure_code='visual_plan_submission_unknown',
      failure_message='Provider submission may have occurred; automatic resubmission is prohibited pending authoritative reconciliation.',
      updated_at=now()
  where operation_id=op.operation_id returning * into op;
  return jsonb_build_object('disposition','submission_unknown','operation',to_jsonb(op),
    'automatic_resubmission_allowed',false,'evidence',p_evidence_json);
end $$;

create or replace function tongs.recover_expired_unified_visual_plan_attempt(
  p_operation_id text,p_operation_fingerprint text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  op tongs.unified_visual_plan_operations%rowtype;
  binding tongs.openai_text_funding_bindings%rowtype;
  attempt_event tongs.funding_reservation_events%rowtype;
  hold tongs.openai_text_failure_exposure_holds%rowtype;
  expense_micros bigint;
  evidence jsonb;
  event_id uuid;
  v_event_key text;
  existing_event tongs.unified_visual_plan_transport_recovery_events%rowtype;
begin
  perform tongs._require_pricing_service_role();
  perform pg_advisory_xact_lock(hashtextextended('unified-visual-plan-transport:'||btrim(p_operation_id),0));
  select * into op from tongs.unified_visual_plan_operations
    where operation_id=btrim(p_operation_id) for update;
  select * into binding from tongs.openai_text_funding_bindings
    where operation_id=btrim(p_operation_id) and route_code='visual.unified_plan';
  if op.operation_id is null or op.operation_fingerprint is distinct from p_operation_fingerprint
    or binding.reservation_id is null or binding.model<>'gpt-5.6-luna'
    or binding.maximum_attempts<>1 then
    raise exception 'invalid unified Visual Plan recovery identity' using errcode='22023';
  end if;
  v_event_key:='visual-unified-transport:'||binding.reservation_id::text;
  select * into existing_event from tongs.unified_visual_plan_transport_recovery_events
    where unified_visual_plan_transport_recovery_events.event_key=v_event_key;
  if found or op.state='submission_unknown' then
    return jsonb_build_object('disposition','submission_unknown_replay','operation',to_jsonb(op),
      'recovery_event_id',existing_event.id,'automatic_resubmission_allowed',false);
  end if;
  if op.state in('verified','failed') then
    return jsonb_build_object('disposition','terminal_operation','operation',to_jsonb(op));
  end if;
  if op.state<>'pending' or op.provider_response_json is not null or op.receipt_json is not null
    or exists(select 1 from tongs.openai_text_provider_captures c where c.reservation_id=binding.reservation_id)
    or exists(select 1 from tongs.openai_text_usage_evidence u where u.reservation_id=binding.reservation_id)
    or exists(select 1 from tongs.openai_text_persisted_results r where r.reservation_id=binding.reservation_id) then
    raise exception 'captured or persisted provider evidence requires authoritative reconciliation' using errcode='P0001';
  end if;
  select * into attempt_event from tongs.funding_reservation_events
    where reservation_id=binding.reservation_id
    order by sequence desc limit 1;
  if attempt_event.id is null or attempt_event.event_type<>'provider_attempt_shadowed'
    or attempt_event.provider_attempt_key is null then
    raise exception 'provider attempt lease not found' using errcode='P0002';
  end if;
  if attempt_event.lease_expires_at is null or attempt_event.lease_expires_at>now() then
    return jsonb_build_object('disposition','attempt_in_progress','lease_expires_at',attempt_event.lease_expires_at);
  end if;
  select * into hold from tongs.openai_text_failure_exposure_holds
    where reservation_id=binding.reservation_id and attempt_key=attempt_event.provider_attempt_key;
  if hold.id is null then raise exception 'failure exposure hold not found' using errcode='P0002'; end if;
  select coalesce(sum(amount_micros),0) into expense_micros from tongs.supplier_expenses
    where reservation_id=binding.reservation_id and coalesce(amount_micros,0)>0;
  if expense_micros<>0 then
    raise exception 'supplier expense evidence requires authoritative reconciliation' using errcode='P0001';
  end if;
  evidence:=jsonb_build_object(
    'route_code','visual.unified_plan','operation_id',op.operation_id,
    'reservation_id',binding.reservation_id,'attempt_key',attempt_event.provider_attempt_key,
    'lease_expires_at',attempt_event.lease_expires_at,'recovered_at',now(),
    'transmission_status','unknown','transmitted',null,
    'reason','attempt lease expired without a durable provider outcome',
    'automatic_resubmission_allowed',false,'provider_capture_count',0,
    'usage_evidence_count',0,'canonical_result_count',0,'supplier_expense_micros',0
  );
  perform tongs.close_openai_text_failure_exposure(binding.reservation_id,
    attempt_event.provider_attempt_key,'unresolved',null,evidence);
  perform tongs.mark_submission_unknown(binding.reservation_id,
    attempt_event.provider_attempt_key||':submission-unknown',attempt_event.provider_attempt_key,evidence);
  perform tongs.record_paid_operation_aggregate_outcome(binding.reservation_id,
    attempt_event.provider_attempt_key||':aggregate-ambiguous','ambiguous',null,null,evidence);
  update tongs.unified_visual_plan_operations
  set state='submission_unknown',failed_stage='provider_transport',
      failure_code='visual_plan_submission_unknown',
      failure_message='Provider submission may have occurred; automatic resubmission is prohibited pending authoritative reconciliation.',
      updated_at=now()
  where operation_id=op.operation_id returning * into op;
  event_id:=extensions.uuid_generate_v5(binding.reservation_id,'unified-visual-plan-expired-attempt-recovery-v1');
  insert into tongs.unified_visual_plan_transport_recovery_events(
    id,event_key,operation_id,reservation_id,failure_exposure_hold_id,event_type,evidence_json
  ) values(event_id,v_event_key,op.operation_id,binding.reservation_id,hold.id,
    'expired_attempt_submission_unknown',evidence)
  on conflict(event_key) do nothing;
  return jsonb_build_object('disposition','submission_unknown','operation',to_jsonb(op),
    'recovery_event_id',event_id,'automatic_resubmission_allowed',false,'evidence',evidence);
end $$;

revoke all on function tongs.mark_unified_visual_plan_submission_unknown(text,text,uuid,jsonb)
  from public,anon,authenticated,service_role;
revoke all on function tongs.recover_expired_unified_visual_plan_attempt(text,text)
  from public,anon,authenticated,service_role;
grant execute on function tongs.mark_unified_visual_plan_submission_unknown(text,text,uuid,jsonb) to service_role;
grant execute on function tongs.recover_expired_unified_visual_plan_attempt(text,text) to service_role;

comment on table tongs.unified_visual_plan_transport_recovery_events is
  'Append-only service evidence for expired Visual Plan attempts whose provider transmission status is unknown.';
comment on function tongs.recover_expired_unified_visual_plan_attempt(text,text) is
  'Service-only replay-safe stale-attempt recovery. It records ambiguity and prohibits provider replay; it does not infer non-transmission from missing captures.';

notify pgrst,'reload schema';
commit;
