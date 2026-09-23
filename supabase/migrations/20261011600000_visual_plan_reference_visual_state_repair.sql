begin;

-- The four-child state was introduced in 20260805130000. Later failure and
-- transport recovery migrations replaced this constraint without carrying it
-- forward, so a valid Reference Visual receipt could not be retained.
alter table tongs.unified_visual_plan_operations
  drop constraint unified_visual_plan_operations_state_check;
alter table tongs.unified_visual_plan_operations
  add constraint unified_visual_plan_operations_state_check check(state in(
    'pending','provider_completed','image_plan_committed','broll_plan_committed',
    'reference_plan_committed','reference_visual_plan_committed','verified',
    'failed','submission_unknown'
  ));

create table tongs.unified_visual_plan_persistence_reconciliation_events(
  id uuid primary key,
  event_key text not null unique check(length(btrim(event_key)) between 8 and 300),
  operation_id text not null references tongs.unified_visual_plan_operations(operation_id) on delete restrict,
  reservation_id uuid not null references tongs.funding_reservations(id) on delete restrict,
  provider_capture_id uuid not null references tongs.openai_text_provider_captures(id) on delete restrict,
  usage_evidence_id uuid not null references tongs.openai_text_usage_evidence(id) on delete restrict,
  supplier_expense_id uuid not null references tongs.supplier_expenses(id) on delete restrict,
  event_type text not null check(event_type='reference_visual_state_constraint_recovered'),
  evidence_json jsonb not null check(jsonb_typeof(evidence_json)='object'),
  created_at timestamptz not null default now()
);
alter table tongs.unified_visual_plan_persistence_reconciliation_events enable row level security;
alter table tongs.unified_visual_plan_persistence_reconciliation_events force row level security;
revoke all on tongs.unified_visual_plan_persistence_reconciliation_events
  from public,anon,authenticated,service_role;
grant select on tongs.unified_visual_plan_persistence_reconciliation_events to service_role;
create trigger unified_visual_plan_persistence_reconciliation_events_immutable
before update or delete on tongs.unified_visual_plan_persistence_reconciliation_events
for each row execute function tongs._reject_accounting_mutation();

create function tongs.reconcile_unified_visual_plan_reference_visual_state_failure(
  p_operation_id text,
  p_operation_fingerprint text,
  p_reservation_id uuid,
  p_reference_visual_plan_revision_id uuid,
  p_reference_visual_plan_revision bigint,
  p_reference_visual_plan_content_hash text,
  p_provider_response_hash text,
  p_expected_input_units bigint,
  p_expected_output_units bigint,
  p_expected_supplier_expense_micros bigint
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$
declare
  op tongs.unified_visual_plan_operations%rowtype;
  binding tongs.openai_text_funding_bindings%rowtype;
  reservation tongs.funding_reservations%rowtype;
  capture tongs.openai_text_provider_captures%rowtype;
  usage_evidence tongs.openai_text_usage_evidence%rowtype;
  supplier_expense tongs.supplier_expenses%rowtype;
  reference_visual_revision tongs.reference_visual_plan_revisions%rowtype;
  existing_event tongs.unified_visual_plan_persistence_reconciliation_events%rowtype;
  verified_receipt jsonb;
  prior_subject text;
  v_event_key text:='visual-unified-reference-visual-state:'||p_reservation_id::text;
  v_event_id uuid:=extensions.uuid_generate_v5(
    p_reservation_id,'unified-visual-plan-reference-visual-state-recovery-v1');
  capture_count bigint;
  usage_count bigint;
  positive_expense_count bigint;
  positive_expense_sum bigint;
  settlement_count bigint;
  settled_customer_charge bigint;
  settled_credit_units bigint;
begin
  perform tongs._require_pricing_service_role();
  perform pg_advisory_xact_lock(hashtextextended(v_event_key,0));

  if btrim(coalesce(p_operation_id,''))<>p_operation_id
    or p_operation_fingerprint!~'^[0-9a-f]{64}$'
    or p_reference_visual_plan_revision<1
    or p_reference_visual_plan_content_hash!~'^[0-9a-f]{64}$'
    or p_provider_response_hash!~'^[0-9a-f]{64}$'
    or p_expected_input_units<>3332
    or p_expected_output_units<>3769
    or p_expected_supplier_expense_micros<>5190
  then raise exception 'invalid Visual Plan persistence reconciliation request' using errcode='22023'; end if;

  select * into op from tongs.unified_visual_plan_operations
    where operation_id=p_operation_id for update;
  select * into binding from tongs.openai_text_funding_bindings
    where operation_id=p_operation_id and reservation_id=p_reservation_id
      and route_code='visual.unified_plan';
  select * into reservation from tongs.funding_reservations where id=p_reservation_id;

  select count(*) into capture_count from tongs.openai_text_provider_captures
    where reservation_id=p_reservation_id;
  select * into capture from tongs.openai_text_provider_captures
    where reservation_id=p_reservation_id and attempt_number=1;
  select count(*) into usage_count from tongs.openai_text_usage_evidence
    where reservation_id=p_reservation_id;
  select * into usage_evidence from tongs.openai_text_usage_evidence
    where reservation_id=p_reservation_id and attempt_number=1;
  select count(*) filter(where amount_micros>0),
         coalesce(sum(amount_micros) filter(where amount_micros>0),0)
    into positive_expense_count,positive_expense_sum
    from tongs.supplier_expenses where reservation_id=p_reservation_id;
  select * into supplier_expense from tongs.supplier_expenses
    where reservation_id=p_reservation_id and amount_micros>0;
  select count(*),coalesce(sum(customer_charge_micros),0),coalesce(sum(credit_units),0)
    into settlement_count,settled_customer_charge,settled_credit_units
    from tongs.funding_reservation_events
    where reservation_id=p_reservation_id and event_type='settled';
  select * into reference_visual_revision from tongs.reference_visual_plan_revisions
    where id=p_reference_visual_plan_revision_id;
  select * into existing_event
    from tongs.unified_visual_plan_persistence_reconciliation_events
    where event_key=v_event_key;

  if op.operation_id is null
    or op.operation_fingerprint is distinct from p_operation_fingerprint
    or op.contract_version<>'forge.unified-visual-plan.v2'
    or op.state not in('failed','verified')
    or op.provider_response_json is null
    or op.provider_response_hash is distinct from p_provider_response_hash
    or op.normalized_inputs_json->>'provider_contract_version'
       is distinct from 'forge.unified-visual-plan-provider.v5'
    or op.provider_response_json->>'provider_request_id'
       is distinct from capture.provider_request_id
    or (op.provider_response_json->>'input_units')::bigint is distinct from p_expected_input_units
    or (op.provider_response_json->>'output_units')::bigint is distinct from p_expected_output_units
    or jsonb_array_length(coalesce(op.provider_response_json#>'{canonical_plan,reference_visuals}','[]'::jsonb))=0
    or binding.reservation_id is null
    or binding.model<>'gpt-5.6-luna'
    or binding.maximum_attempts<>1
    or binding.maximum_input_units<>32000
    or binding.maximum_output_units<>6144
    or reservation.id is null
    or reservation.operation_id is distinct from p_operation_id||':q:'||reservation.quote_id::text
    or reservation.reserved_credit_units<>4
    or reservation.reserved_wholesale_spend_micros<>13773
    or tongs._funding_reservation_state(p_reservation_id)<>'released'
    or settlement_count<>0
    or settled_customer_charge<>0
    or settled_credit_units<>0
    or capture_count<>1 or capture.id is null or capture.attempt_number<>1
    or capture.input_units is distinct from p_expected_input_units
    or capture.output_units is distinct from p_expected_output_units
    or capture.provider_request_id is null
    or capture.response_evidence_json->>'raw_provider_response_text' is null
    or capture.response_evidence_json->>'validation_contract_revision'
       is distinct from 'forge.unified-visual-plan-provider.v5'
    or usage_count<>1 or usage_evidence.id is null or usage_evidence.attempt_number<>1
    or usage_evidence.provider_request_id is distinct from capture.provider_request_id
    or usage_evidence.input_units is distinct from p_expected_input_units
    or usage_evidence.output_units is distinct from p_expected_output_units
    or usage_evidence.result_validated is not true
    or usage_evidence.canonical_persistence_confirmed is not false
    or usage_evidence.evidence_json->>'validation_contract_revision'
       is distinct from 'forge.unified-visual-plan-provider.v5'
    or positive_expense_count<>1
    or positive_expense_sum is distinct from p_expected_supplier_expense_micros
    or supplier_expense.id is null or supplier_expense.provider<>'openai'
    or supplier_expense.amount_micros is distinct from p_expected_supplier_expense_micros
    or exists(select 1 from tongs.openai_text_persisted_results
      where reservation_id=p_reservation_id)
  then raise exception 'invalid Visual Plan persistence reconciliation evidence' using errcode='22023'; end if;

  if op.image_map_revision_id is null or op.image_map_revision<>1
    or op.broll_plan_revision_id is null or op.broll_plan_revision<>1
    or op.reference_clip_plan_revision_id is null or op.reference_clip_plan_revision<>1
    or reference_visual_revision.id is null
    or reference_visual_revision.workspace_id is distinct from op.workspace_id
    or reference_visual_revision.workpiece_id is distinct from op.workpiece_id
    or reference_visual_revision.revision is distinct from p_reference_visual_plan_revision
    or reference_visual_revision.script_approval_id is distinct from op.script_approval_id
    or reference_visual_revision.script_approval_revision is distinct from op.script_approval_revision
    or reference_visual_revision.script_content_hash is distinct from op.script_content_hash
    or reference_visual_revision.contract_version<>'forge.unified-visual-plan.v2'
    or reference_visual_revision.content_hash is distinct from p_reference_visual_plan_content_hash
    or op.child_membership_evidence_json#>>'{reference_visual,provider_plan_revision_id}'
       is distinct from p_reference_visual_plan_revision_id::text
    or op.child_membership_evidence_json#>>'{reference_visual,final_plan_revision_id}'
       is distinct from p_reference_visual_plan_revision_id::text
    or not exists(select 1 from tongs.image_map_revisions r
      where r.id=op.image_map_revision_id and r.workspace_id=op.workspace_id
        and r.workpiece_id=op.workpiece_id and r.revision=op.image_map_revision
        and r.source_script_approval_id=op.script_approval_id
        and r.source_script_approval_revision=op.script_approval_revision
        and r.source_script_content_hash=op.script_content_hash
        and r.document_content_hash=op.image_plan_content_hash)
    or not exists(select 1 from tongs.broll_plan_revisions r
      where r.id=op.broll_plan_revision_id and r.workspace_id=op.workspace_id
        and r.workpiece_id=op.workpiece_id and r.revision=op.broll_plan_revision
        and r.script_approval_id=op.script_approval_id
        and r.script_approval_revision=op.script_approval_revision
        and r.script_content_hash=op.script_content_hash
        and r.content_hash=op.broll_plan_content_hash)
    or not exists(select 1 from tongs.reference_clip_plan_revisions r
      where r.id=op.reference_clip_plan_revision_id and r.workspace_id=op.workspace_id
        and r.workpiece_id=op.workpiece_id and r.revision=op.reference_clip_plan_revision
        and r.script_approval_id=op.script_approval_id
        and r.script_approval_revision=op.script_approval_revision
        and r.script_content_hash=op.script_content_hash
        and r.content_hash=op.reference_clip_plan_content_hash)
    or not exists(select 1 from tongs.workpiece_image_map_sequences s
      where s.workspace_id=op.workspace_id and s.workpiece_id=op.workpiece_id
        and s.current_revision_id=op.image_map_revision_id and s.current_revision=op.image_map_revision)
    or not exists(select 1 from tongs.broll_plan_sequences s
      where s.workspace_id=op.workspace_id and s.workpiece_id=op.workpiece_id
        and s.current_plan_revision_id=op.broll_plan_revision_id and s.current_plan_revision=op.broll_plan_revision)
    or not exists(select 1 from tongs.reference_clip_plan_sequences s
      where s.workspace_id=op.workspace_id and s.workpiece_id=op.workpiece_id
        and s.current_plan_revision_id=op.reference_clip_plan_revision_id and s.current_plan_revision=op.reference_clip_plan_revision)
    or not exists(select 1 from tongs.reference_visual_plan_sequences s
      where s.workspace_id=op.workspace_id and s.workpiece_id=op.workpiece_id
        and s.current_plan_revision_id=p_reference_visual_plan_revision_id
        and s.current_plan_revision=p_reference_visual_plan_revision)
    or exists(select 1 from tongs.image_map_revisions r
      where r.workspace_id=op.workspace_id and r.workpiece_id=op.workpiece_id
        and r.revision>op.image_map_revision)
    or exists(select 1 from tongs.broll_plan_revisions r
      where r.workspace_id=op.workspace_id and r.workpiece_id=op.workpiece_id
        and r.revision>op.broll_plan_revision)
    or exists(select 1 from tongs.reference_clip_plan_revisions r
      where r.workspace_id=op.workspace_id and r.workpiece_id=op.workpiece_id
        and r.revision>op.reference_clip_plan_revision)
    or exists(select 1 from tongs.reference_visual_plan_revisions r
      where r.workspace_id=op.workspace_id and r.workpiece_id=op.workpiece_id
        and r.revision>p_reference_visual_plan_revision)
  then raise exception 'canonical Visual Plan children changed after the failed receipt' using errcode='23505'; end if;

  if op.state='verified' then
    if existing_event.id is null or op.receipt_json is null
      or existing_event.operation_id is distinct from op.operation_id
      or existing_event.reservation_id is distinct from p_reservation_id
      or existing_event.provider_capture_id is distinct from capture.id
      or existing_event.usage_evidence_id is distinct from usage_evidence.id
      or existing_event.supplier_expense_id is distinct from supplier_expense.id
      or existing_event.evidence_json->>'provider_response_hash' is distinct from p_provider_response_hash
      or existing_event.evidence_json->>'reference_visual_plan_content_hash'
         is distinct from p_reference_visual_plan_content_hash
    then raise exception 'Visual Plan persistence reconciliation replay conflict' using errcode='23505'; end if;
    return jsonb_build_object('disposition','replay','replay',true,
      'operation_id',op.operation_id,'receipt',op.receipt_json,
      'reconciliation_event_id',existing_event.id);
  end if;

  if existing_event.id is not null
    or op.failed_stage is distinct from 'reference_visual_retention'
    or op.failure_code is distinct from 'unified_reference_visual_receipt_failed'
    or op.failure_message is distinct from
       'new row for relation "unified_visual_plan_operations" violates check constraint "unified_visual_plan_operations_state_check"'
    or op.receipt_json is not null
    or op.reference_visual_plan_revision_id is not null
    or op.reference_visual_plan_revision is not null
    or op.reference_visual_plan_content_hash is not null
    or op.reference_visual_plan_empty is not null
  then raise exception 'Visual Plan persistence failure is not the reviewed historical state' using errcode='23505'; end if;

  insert into tongs.unified_visual_plan_persistence_reconciliation_events(
    id,event_key,operation_id,reservation_id,provider_capture_id,usage_evidence_id,
    supplier_expense_id,event_type,evidence_json
  ) values(
    v_event_id,v_event_key,op.operation_id,p_reservation_id,capture.id,usage_evidence.id,
    supplier_expense.id,'reference_visual_state_constraint_recovered',jsonb_build_object(
      'operation_fingerprint',op.operation_fingerprint,
      'provider_response_hash',op.provider_response_hash,
      'provider_contract_version','forge.unified-visual-plan-provider.v5',
      'provider_request_id',capture.provider_request_id,
      'input_units',capture.input_units,'output_units',capture.output_units,
      'supplier_expense_micros',positive_expense_sum,
      'customer_charge_micros',0,'settled_credit_units',0,
      'reservation_state','released','canonical_paid_result_count',0,
      'nonbillable_reason','Forge persistence state-constraint defect after successful child persistence',
      'image_plan',jsonb_build_object('revision_id',op.image_map_revision_id,'revision',op.image_map_revision,'content_hash',op.image_plan_content_hash),
      'broll_plan',jsonb_build_object('revision_id',op.broll_plan_revision_id,'revision',op.broll_plan_revision,'content_hash',op.broll_plan_content_hash),
      'reference_clip_plan',jsonb_build_object('revision_id',op.reference_clip_plan_revision_id,'revision',op.reference_clip_plan_revision,'content_hash',op.reference_clip_plan_content_hash),
      'reference_visual_plan',jsonb_build_object('revision_id',reference_visual_revision.id,'revision',reference_visual_revision.revision,'content_hash',reference_visual_revision.content_hash)
    )
  );

  update tongs.unified_visual_plan_operations
  set state='reference_visual_plan_committed',
      reference_visual_plan_revision_id=reference_visual_revision.id,
      reference_visual_plan_revision=reference_visual_revision.revision,
      reference_visual_plan_content_hash=reference_visual_revision.content_hash,
      reference_visual_plan_empty=false,
      failed_stage=null,failure_code=null,failure_message=null,updated_at=now()
  where operation_id=op.operation_id;

  -- The canonical verifier is intentionally reused. The service-only recovery
  -- temporarily supplies the original actor identity so its workspace-role gate
  -- remains authoritative rather than duplicating receipt construction here.
  prior_subject:=current_setting('request.jwt.claim.sub',true);
  perform set_config('request.jwt.claim.sub',op.created_by::text,true);
  verified_receipt:=tongs.verify_unified_visual_plan(op.operation_id,op.operation_fingerprint);
  perform set_config('request.jwt.claim.sub',coalesce(prior_subject,''),true);
  if verified_receipt->>'disposition'<>'verified'
    or verified_receipt#>>'{reference_visual_plan,revision_id}'
       is distinct from reference_visual_revision.id::text
    or not exists(select 1 from tongs.unified_visual_plan_operations current_op
      where current_op.operation_id=op.operation_id and current_op.state='verified'
        and current_op.receipt_json=verified_receipt)
  then raise exception 'canonical Visual Plan verification did not complete' using errcode='P0001'; end if;

  return jsonb_build_object('disposition','recovered','replay',false,
    'operation_id',op.operation_id,'receipt',verified_receipt,
    'reconciliation_event_id',v_event_id,
    'customer_charge_micros',0,'settled_credit_units',0,
    'supplier_expense_micros',positive_expense_sum,'reservation_state','released');
end $$;

revoke all on function tongs.reconcile_unified_visual_plan_reference_visual_state_failure(
  text,text,uuid,uuid,bigint,text,text,bigint,bigint,bigint
) from public,anon,authenticated,service_role;
grant execute on function tongs.reconcile_unified_visual_plan_reference_visual_state_failure(
  text,text,uuid,uuid,bigint,text,text,bigint,bigint,bigint
) to service_role;

comment on table tongs.unified_visual_plan_persistence_reconciliation_events is
  'Append-only service evidence for recovery of a canonical Visual Plan after a verified Forge persistence defect; it never authorizes customer settlement.';
comment on function tongs.reconcile_unified_visual_plan_reference_visual_state_failure(
  text,text,uuid,uuid,bigint,text,text,bigint,bigint,bigint
) is
  'Service-only, replay-safe recovery of an already-persisted four-child Visual Plan. Requires exact provider, usage, supplier-cost, released-reservation, and unsuperseded child evidence; makes no provider or billing call.';

notify pgrst,'reload schema';
commit;
