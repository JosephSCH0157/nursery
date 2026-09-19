begin;

-- Title v2 changes only the output contract: full episode titles may use up to
-- 12 words. Keep v1 admissible for historical result/replay identity. Pricing,
-- model limits, scopes, and financial exposure are unchanged.
create or replace function tongs.persist_hearth_title_generation_result(
  p_operation_id text,p_reservation_id uuid,p_user_id uuid,p_workspace_id uuid,
  p_workpiece_id uuid,p_request_fingerprint text,p_approval_id uuid,
  p_approval_revision integer,p_script_hash text,p_provider_request_id text,
  p_input_units bigint,p_output_units bigint,p_result_json jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  binding tongs.openai_text_funding_bindings%rowtype;
  quote_binding tongs.openai_text_customer_quote_bindings%rowtype;
  approval tongs.script_approval_revisions%rowtype;
  sequence_row tongs.workpiece_script_approval_sequences%rowtype;
  existing tongs.hearth_title_generation_results%rowtype;
  result_id uuid:=extensions.uuid_generate_v5(p_reservation_id,'hearth-title-result');
begin
  perform tongs._require_pricing_service_role();
  perform pg_advisory_xact_lock(hashtextextended('hearth-title-result:'||p_reservation_id::text,0));
  select * into binding from tongs.openai_text_funding_bindings
  where operation_id=btrim(p_operation_id) and reservation_id=p_reservation_id
    and route_code='hearth.title_generation';
  select quote.* into quote_binding
  from tongs.openai_text_customer_quote_bindings quote
  join tongs.funding_reservations reservation on reservation.quote_id=quote.quote_id
  where reservation.id=p_reservation_id;
  select * into approval from tongs.script_approval_revisions
  where id=p_approval_id and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
  select * into sequence_row from tongs.workpiece_script_approval_sequences
  where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
  if binding.reservation_id is null or quote_binding.quote_id is null
    or binding.cost_policy_revision_id<>'14000000-0000-4000-8000-000000000001'::uuid
    or binding.model<>'gpt-5.6-luna' or binding.maximum_attempts<>1
    or quote_binding.user_id<>p_user_id or quote_binding.workspace_id<>p_workspace_id
    or quote_binding.workpiece_id<>p_workpiece_id::text
    or quote_binding.request_fingerprint<>p_request_fingerprint
    or approval.id is null or approval.approval_revision<>p_approval_revision
    or approval.script_content_hash<>p_script_hash
    or encode(extensions.digest(convert_to(approval.script_text,'utf8'),'sha256'),'hex')<>p_script_hash
    or sequence_row.current_approval_id is distinct from p_approval_id
    or sequence_row.current_revision is distinct from p_approval_revision
    or p_input_units not between 0 and 12000 or p_output_units not between 0 and 512
    or jsonb_typeof(coalesce(p_result_json,'null'::jsonb))<>'object'
    or coalesce(p_result_json->>'contract','') not in (
      'forge.hearth.title-generation.v1','forge.hearth.title-generation.v2'
    )
    or p_result_json->>'script_approval_id' is distinct from p_approval_id::text
    or (p_result_json->>'script_approval_revision')::integer is distinct from p_approval_revision
    or p_result_json->>'script_content_hash' is distinct from p_script_hash
    or jsonb_typeof(p_result_json->'titles')<>'array'
    or jsonb_array_length(p_result_json->'titles')<>5
    or nullif(btrim(coalesce(p_result_json->>'assistant_text','')),'') is null
  then raise exception 'invalid bounded Hearth title result' using errcode='22023'; end if;
  select * into existing from tongs.hearth_title_generation_results
  where operation_id=btrim(p_operation_id) or reservation_id=p_reservation_id;
  if found then
    if existing.operation_id<>btrim(p_operation_id)
      or existing.reservation_id<>p_reservation_id
      or existing.request_fingerprint<>p_request_fingerprint
      or existing.result_json<>p_result_json
    then raise exception 'Hearth title result replay conflict' using errcode='23505'; end if;
    return existing.result_json||jsonb_build_object(
      'title_result_id',existing.id,'created_at',existing.created_at,
      'provider_request_id',existing.provider_request_id,
      'input_units',existing.input_units,'output_units',existing.output_units,'replay',true
    );
  end if;
  insert into tongs.hearth_title_generation_results(
    id,operation_id,reservation_id,user_id,workspace_id,workpiece_id,
    request_fingerprint,approval_id,approval_revision,script_content_hash,
    provider_request_id,input_units,output_units,result_json
  ) values(
    result_id,btrim(p_operation_id),p_reservation_id,p_user_id,p_workspace_id,
    p_workpiece_id,p_request_fingerprint,p_approval_id,p_approval_revision,
    p_script_hash,p_provider_request_id,p_input_units,p_output_units,p_result_json
  ) returning * into existing;
  return existing.result_json||jsonb_build_object(
    'title_result_id',existing.id,'created_at',existing.created_at,
    'provider_request_id',existing.provider_request_id,
    'input_units',existing.input_units,'output_units',existing.output_units,'replay',false
  );
end $$;

-- A read-only readiness marker prevents a newer application server from
-- quoting a v2 request while this atomic forward migration is still pending.
create or replace function tongs.read_hearth_title_generation_contract_version()
returns integer language sql stable security definer set search_path=pg_catalog as $$
  select 2
$$;

revoke all on function tongs.persist_hearth_title_generation_result(
  text,uuid,uuid,uuid,uuid,text,uuid,integer,text,text,bigint,bigint,jsonb
) from public,anon,authenticated;
grant execute on function tongs.persist_hearth_title_generation_result(
  text,uuid,uuid,uuid,uuid,text,uuid,integer,text,text,bigint,bigint,jsonb
) to service_role;
revoke all on function tongs.read_hearth_title_generation_contract_version()
  from public,anon,authenticated;
grant execute on function tongs.read_hearth_title_generation_contract_version()
  to service_role;

notify pgrst,'reload schema';

commit;
