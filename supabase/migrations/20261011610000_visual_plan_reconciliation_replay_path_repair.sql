begin;

-- The recovery event already stores the Reference Visual hash canonically at
-- evidence_json.reference_visual_plan.content_hash. Repair only the replay
-- reader; the immutable event and every identity/financial guard remain intact.
do $repair$
declare
  target_function constant regprocedure :=
    'tongs.reconcile_unified_visual_plan_reference_visual_state_failure(text,text,uuid,uuid,bigint,text,text,bigint,bigint,bigint)'::regprocedure;
  old_path constant text :=
    $old$existing_event.evidence_json->>'reference_visual_plan_content_hash'$old$;
  canonical_path constant text :=
    $new$existing_event.evidence_json#>>'{reference_visual_plan,content_hash}'$new$;
  function_body text;
  repaired_body text;
  old_path_count bigint;
begin
  select routine.prosrc
    into function_body
    from pg_proc routine
    where routine.oid=target_function;

  old_path_count := (
    length(function_body)-length(replace(function_body,old_path,''))
  )/length(old_path);

  if function_body is null
    or old_path_count<>1
    or position(canonical_path in function_body)<>0
  then
    raise exception 'Visual Plan reconciliation replay authority is not at the reviewed pre-repair definition';
  end if;

  repaired_body:=replace(function_body,old_path,canonical_path);

  execute format(
    $definition$
      create or replace function tongs.reconcile_unified_visual_plan_reference_visual_state_failure(
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
      as %L
    $definition$,
    repaired_body
  );
end
$repair$;

revoke all on function tongs.reconcile_unified_visual_plan_reference_visual_state_failure(
  text,text,uuid,uuid,bigint,text,text,bigint,bigint,bigint
) from public,anon,authenticated,service_role;
grant execute on function tongs.reconcile_unified_visual_plan_reference_visual_state_failure(
  text,text,uuid,uuid,bigint,text,text,bigint,bigint,bigint
) to service_role;

comment on function tongs.reconcile_unified_visual_plan_reference_visual_state_failure(
  text,text,uuid,uuid,bigint,text,text,bigint,bigint,bigint
) is
  'Service-only, replay-safe recovery of an already-persisted four-child Visual Plan. Requires exact provider, usage, supplier-cost, released-reservation, and unsuperseded child evidence; makes no provider or billing call.';

do $verify$
declare
  function_body text;
begin
  select routine.prosrc
    into function_body
    from pg_proc routine
    where routine.oid=
      'tongs.reconcile_unified_visual_plan_reference_visual_state_failure(text,text,uuid,uuid,bigint,text,text,bigint,bigint,bigint)'::regprocedure;

  if position(
      $new$existing_event.evidence_json#>>'{reference_visual_plan,content_hash}'$new$
      in function_body
    )=0
    or position(
      $old$existing_event.evidence_json->>'reference_visual_plan_content_hash'$old$
      in function_body
    )<>0
  then
    raise exception 'Visual Plan reconciliation replay path repair did not install';
  end if;
end
$verify$;

notify pgrst,'reload schema';
commit;
