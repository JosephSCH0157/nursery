begin;

alter table tongs.unified_visual_plan_operations
  drop constraint unified_visual_plan_operations_state_check;
alter table tongs.unified_visual_plan_operations
  add constraint unified_visual_plan_operations_state_check check(state in(
    'pending','provider_completed','image_plan_committed','broll_plan_committed',
    'reference_plan_committed','verified','failed'
  ));

create table tongs.unified_visual_plan_reconciliation_events(
  id uuid primary key,
  event_key text not null unique check(length(btrim(event_key)) between 8 and 300),
  operation_id text not null references tongs.unified_visual_plan_operations(operation_id) on delete restrict,
  reservation_id uuid not null references tongs.funding_reservations(id) on delete restrict,
  provider_capture_id uuid not null references tongs.openai_text_provider_captures(id) on delete restrict,
  event_type text not null check(event_type='validation_failure_terminalized'),
  evidence_json jsonb not null check(jsonb_typeof(evidence_json)='object'),
  created_at timestamptz not null default now()
);
alter table tongs.unified_visual_plan_reconciliation_events enable row level security;
alter table tongs.unified_visual_plan_reconciliation_events force row level security;
revoke all on tongs.unified_visual_plan_reconciliation_events from public,anon,authenticated,service_role;
grant select on tongs.unified_visual_plan_reconciliation_events to service_role;
create trigger unified_visual_plan_reconciliation_events_immutable
before update or delete on tongs.unified_visual_plan_reconciliation_events
for each row execute function tongs._reject_accounting_mutation();

create or replace function tongs.fail_unified_visual_plan(
  p_operation_id text,p_operation_fingerprint text,p_failed_stage text,
  p_failure_code text,p_failure_message text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare op tongs.unified_visual_plan_operations%rowtype;
begin
  select * into op from tongs.unified_visual_plan_operations where operation_id=p_operation_id for update;
  if not found or op.operation_fingerprint<>p_operation_fingerprint then
    return jsonb_build_object('disposition','operation_identity_conflict');
  end if;
  if not tongs.has_workspace_role(op.workspace_id,'editor') then
    raise exception 'workspace editor authority required' using errcode='42501';
  end if;
  if op.state='verified' then return op.receipt_json; end if;
  if op.state='failed' then
    if op.failed_stage is distinct from p_failed_stage
      or op.failure_code is distinct from p_failure_code
      or op.failure_message is distinct from p_failure_message then
      return jsonb_build_object('disposition','terminal_failure_conflict','operation',to_jsonb(op));
    end if;
    return jsonb_build_object('disposition','failed_replay','operation',to_jsonb(op));
  end if;
  update tongs.unified_visual_plan_operations
  set state='failed',failed_stage=p_failed_stage,failure_code=p_failure_code,
      failure_message=p_failure_message,updated_at=now()
  where operation_id=p_operation_id returning * into op;
  return jsonb_build_object('disposition','failed','operation',to_jsonb(op));
end $$;

create or replace function tongs.record_openai_text_validation_failure_evidence(
  p_route_code text,p_operation_id text,p_reservation_id uuid,p_provider_request_id text,
  p_model text,p_input_units bigint,p_output_units bigint,p_raw_provider_response_text text,
  p_validation_error_code text,p_validation_contract_revision text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  binding tongs.openai_text_funding_bindings%rowtype;
  capture tongs.openai_text_provider_captures%rowtype;
  existing tongs.openai_text_validation_failure_evidence%rowtype;
  evidence_id uuid:=extensions.uuid_generate_v5(p_reservation_id,'openai-text-validation-failure-v1');
begin
  perform tongs._require_pricing_service_role();
  perform pg_advisory_xact_lock(hashtextextended('openai-text-validation-failure:'||p_reservation_id::text,0));
  select * into binding from tongs.openai_text_funding_bindings
  where operation_id=btrim(p_operation_id) and reservation_id=p_reservation_id and route_code=p_route_code;
  select * into capture from tongs.openai_text_provider_captures
  where reservation_id=p_reservation_id and attempt_number=1;
  if p_route_code not in ('hearth.framing_pack_generation','visual.unified_plan')
    or binding.reservation_id is null or binding.model<>'gpt-5.6-luna'
    or binding.maximum_attempts<>1 or capture.id is null
    or capture.provider_request_id is distinct from nullif(btrim(coalesce(p_provider_request_id,'')),'')
    or capture.input_units is distinct from p_input_units
    or capture.output_units is distinct from p_output_units
    or capture.response_evidence_json->>'raw_provider_response_text' is distinct from p_raw_provider_response_text
    or p_model is distinct from binding.model
    or (p_route_code='hearth.framing_pack_generation' and p_validation_contract_revision is distinct from 'framing_pack_seven_sections.v1')
    or (p_route_code='visual.unified_plan' and p_validation_contract_revision not in(
      'forge.unified-visual-plan-provider.v4','forge.unified-visual-plan-provider.v5'))
    or p_validation_error_code!~'^[a-z][a-z0-9_]{2,100}$'
    or octet_length(coalesce(p_raw_provider_response_text,'')) not between 1 and 65536
  then raise exception 'invalid OpenAI text validation evidence' using errcode='22023'; end if;
  select * into existing from tongs.openai_text_validation_failure_evidence
  where reservation_id=p_reservation_id or operation_id=btrim(p_operation_id);
  if found then
    if existing.route_code is distinct from p_route_code
      or existing.provider_capture_id is distinct from capture.id
      or existing.raw_provider_response_text is distinct from p_raw_provider_response_text
      or existing.validation_error_code is distinct from p_validation_error_code
      or existing.validation_contract_revision is distinct from p_validation_contract_revision
    then raise exception 'OpenAI text validation evidence replay conflict' using errcode='23505'; end if;
    return jsonb_build_object('evidence_id',existing.id,'replay',true);
  end if;
  insert into tongs.openai_text_validation_failure_evidence(
    id,route_code,operation_id,reservation_id,provider_capture_id,provider_request_id,
    model,input_units,output_units,raw_provider_response_text,validation_error_code,validation_contract_revision
  ) values(evidence_id,p_route_code,btrim(p_operation_id),p_reservation_id,capture.id,
    capture.provider_request_id,p_model,p_input_units,p_output_units,p_raw_provider_response_text,
    p_validation_error_code,p_validation_contract_revision);
  return jsonb_build_object('evidence_id',evidence_id,'replay',false);
end $$;

create function tongs.reconcile_unified_visual_plan_validation_failure(
  p_operation_id text,p_operation_fingerprint text,p_reservation_id uuid,
  p_validation_error_code text,p_failure_message text,p_validation_contract_revision text,
  p_expected_supplier_expense_micros bigint
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  op tongs.unified_visual_plan_operations%rowtype;
  binding tongs.openai_text_funding_bindings%rowtype;
  capture tongs.openai_text_provider_captures%rowtype;
  existing_evidence tongs.openai_text_validation_failure_evidence%rowtype;
  existing_event tongs.unified_visual_plan_reconciliation_events%rowtype;
  funding_event tongs.funding_reservation_events%rowtype;
  supplier_expense_micros bigint;
  evidence_id uuid:=extensions.uuid_generate_v5(p_reservation_id,'openai-text-validation-failure-v1');
  event_id uuid:=extensions.uuid_generate_v5(p_reservation_id,'unified-visual-plan-validation-reconciliation-v1');
  v_event_key text:='visual-unified-validation:'||p_reservation_id::text;
  was_replay boolean:=false;
begin
  perform tongs._require_pricing_service_role();
  perform pg_advisory_xact_lock(hashtextextended(v_event_key,0));
  select * into op from tongs.unified_visual_plan_operations
    where operation_id=btrim(p_operation_id) for update;
  select * into binding from tongs.openai_text_funding_bindings
    where operation_id=btrim(p_operation_id) and reservation_id=p_reservation_id
      and route_code='visual.unified_plan';
  select * into capture from tongs.openai_text_provider_captures
    where reservation_id=p_reservation_id and attempt_number=1;
  select * into funding_event from tongs.funding_reservation_events
    where reservation_id=p_reservation_id order by sequence desc limit 1;
  select coalesce(sum(amount_micros),0) into supplier_expense_micros
    from tongs.supplier_expenses
    where reservation_id=p_reservation_id and coalesce(amount_micros,0)>0;
  if op.operation_id is null or op.operation_fingerprint is distinct from p_operation_fingerprint
    or op.state not in('pending','failed') or op.provider_response_json is not null or op.receipt_json is not null
    or binding.reservation_id is null or binding.model<>'gpt-5.6-luna' or binding.maximum_attempts<>1
    or capture.id is null or capture.provider_request_id is null
    or capture.response_evidence_json->>'raw_provider_response_text' is null
    or funding_event.event_type<>'released' or coalesce(funding_event.customer_charge_micros,0)<>0
    or coalesce(funding_event.credit_units,0)<>0
    or p_expected_supplier_expense_micros<0
    or supplier_expense_micros is distinct from p_expected_supplier_expense_micros
    or p_validation_error_code!~'^[a-z][a-z0-9_]{2,100}$'
    or p_validation_contract_revision not in(
      'forge.unified-visual-plan-provider.v4','forge.unified-visual-plan-provider.v5')
  then raise exception 'invalid unified Visual Plan reconciliation evidence' using errcode='22023'; end if;
  insert into tongs.openai_text_validation_failure_evidence(
    id,route_code,operation_id,reservation_id,provider_capture_id,provider_request_id,
    model,input_units,output_units,raw_provider_response_text,validation_error_code,validation_contract_revision
  ) values(evidence_id,'visual.unified_plan',op.operation_id,p_reservation_id,capture.id,
    capture.provider_request_id,binding.model,capture.input_units,capture.output_units,
    capture.response_evidence_json->>'raw_provider_response_text',p_validation_error_code,p_validation_contract_revision)
  on conflict(reservation_id) do nothing;
  select * into existing_evidence from tongs.openai_text_validation_failure_evidence
    where reservation_id=p_reservation_id;
  if existing_evidence.id is null
    or existing_evidence.operation_id is distinct from op.operation_id
    or existing_evidence.provider_capture_id is distinct from capture.id
    or existing_evidence.validation_error_code is distinct from p_validation_error_code
    or existing_evidence.validation_contract_revision is distinct from p_validation_contract_revision
  then raise exception 'unified Visual Plan validation evidence replay conflict' using errcode='23505'; end if;
  select * into existing_event from tongs.unified_visual_plan_reconciliation_events where event_key=v_event_key;
  was_replay:=found;
  insert into tongs.unified_visual_plan_reconciliation_events(
    id,event_key,operation_id,reservation_id,provider_capture_id,event_type,evidence_json
  ) values(event_id,v_event_key,op.operation_id,p_reservation_id,capture.id,'validation_failure_terminalized',
    jsonb_build_object('operation_fingerprint',p_operation_fingerprint,'provider_request_id',capture.provider_request_id,
      'model',binding.model,'input_units',capture.input_units,'output_units',capture.output_units,
      'validation_error_code',p_validation_error_code,'validation_contract_revision',p_validation_contract_revision,
      'supplier_expense_micros',supplier_expense_micros,'customer_charge_micros',0,
      'canonical_result_persisted',false))
  on conflict(event_key) do nothing;
  select * into existing_event from tongs.unified_visual_plan_reconciliation_events where event_key=v_event_key;
  if existing_event.operation_id is distinct from op.operation_id
    or existing_event.reservation_id is distinct from p_reservation_id
    or existing_event.provider_capture_id is distinct from capture.id
  then raise exception 'unified Visual Plan reconciliation replay conflict' using errcode='23505'; end if;
  if op.state='pending' then
    update tongs.unified_visual_plan_operations
    set state='failed',failed_stage='validation',failure_code=p_validation_error_code,
        failure_message=p_failure_message,updated_at=now()
    where operation_id=op.operation_id returning * into op;
  elsif op.failed_stage is distinct from 'validation' or op.failure_code is distinct from p_validation_error_code then
    raise exception 'unified Visual Plan terminal failure conflict' using errcode='23505';
  end if;
  return jsonb_build_object('disposition','reconciled','replay',was_replay,
    'operation',to_jsonb(op),'evidence_id',evidence_id,'reconciliation_event_id',event_id);
end $$;

revoke all on function tongs.reconcile_unified_visual_plan_validation_failure(text,text,uuid,text,text,text,bigint)
  from public,anon,authenticated,service_role;
grant execute on function tongs.reconcile_unified_visual_plan_validation_failure(text,text,uuid,text,text,text,bigint)
  to service_role;

comment on table tongs.unified_visual_plan_reconciliation_events is
  'Append-only service evidence for terminal repair of paid unified Visual Plan operations; no canonical result is synthesized.';
comment on function tongs.reconcile_unified_visual_plan_validation_failure(text,text,uuid,text,text,text,bigint) is
  'Service-only replay-safe reconciliation of captured validation failures. Appends evidence before terminalizing the parent operation.';

notify pgrst,'reload schema';
commit;
