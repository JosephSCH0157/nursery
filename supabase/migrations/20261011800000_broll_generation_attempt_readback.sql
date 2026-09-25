begin;

-- Recover an already-created replacement generation identity after a browser
-- refresh. This function is deliberately read-only: it cannot mint an attempt,
-- quote work, reserve funds, or cross a provider boundary.
create or replace function tongs.read_my_customer_runway_generation_attempt(
  p_workspace_id uuid,
  p_workpiece_id uuid,
  p_beat_id uuid,
  p_prompt_revision_id uuid,
  p_prompt_revision bigint,
  p_prompt_content_hash text,
  p_creative_input_hash text
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$
declare
  v_actor uuid:=auth.uid();
  v_attempt tongs.broll_generation_attempts%rowtype;
begin
  if v_actor is null or not tongs.has_workspace_role(p_workspace_id,'editor') then
    raise exception 'workspace editor authority required' using errcode='42501';
  end if;
  if p_workspace_id is null or p_workpiece_id is null or p_beat_id is null
     or p_prompt_revision_id is null or p_prompt_revision is null or p_prompt_revision<=0
     or p_prompt_content_hash is null or p_prompt_content_hash!~'^[0-9a-f]{64}$'
     or p_creative_input_hash is null or p_creative_input_hash!~'^[0-9a-f]{64}$' then
    raise exception 'invalid generation attempt readback context' using errcode='22023';
  end if;

  select attempt.* into v_attempt
  from tongs.broll_generation_attempts attempt
  where attempt.initiated_by=v_actor
    and attempt.workspace_id=p_workspace_id
    and attempt.workpiece_id=p_workpiece_id
    and attempt.beat_id=p_beat_id
    and attempt.prompt_revision_id=p_prompt_revision_id
    and attempt.prompt_revision=p_prompt_revision
    and attempt.prompt_content_hash=lower(p_prompt_content_hash)
    and attempt.creative_input_hash=lower(p_creative_input_hash)
  order by attempt.initiated_at desc
  limit 1;

  if not found then
    return jsonb_build_object('disposition','generation_attempt_not_found');
  end if;

  return jsonb_build_object(
    'disposition','generation_attempt_current',
    'generation_request_id',v_attempt.generation_request_id,
    'attempt_ordinal',v_attempt.attempt_ordinal,
    'previous_operation_id',v_attempt.previous_operation_id,
    'operation_id',v_attempt.operation_id,
    'operation_fingerprint',v_attempt.operation_fingerprint,
    'creative_input_hash',v_attempt.creative_input_hash,
    'prompt_revision_id',v_attempt.prompt_revision_id,
    'prompt_revision',v_attempt.prompt_revision,
    'prompt_content_hash',v_attempt.prompt_content_hash,
    'replay',true
  );
end $$;

revoke all on function tongs.read_my_customer_runway_generation_attempt(uuid,uuid,uuid,uuid,bigint,text,text) from public,anon;
grant execute on function tongs.read_my_customer_runway_generation_attempt(uuid,uuid,uuid,uuid,bigint,text,text) to authenticated,service_role;

do $$
begin
  if has_function_privilege('public','tongs.read_my_customer_runway_generation_attempt(uuid,uuid,uuid,uuid,bigint,text,text)','execute')
     or has_function_privilege('anon','tongs.read_my_customer_runway_generation_attempt(uuid,uuid,uuid,uuid,bigint,text,text)','execute')
     or not has_function_privilege('authenticated','tongs.read_my_customer_runway_generation_attempt(uuid,uuid,uuid,uuid,bigint,text,text)','execute')
     or not has_function_privilege('service_role','tongs.read_my_customer_runway_generation_attempt(uuid,uuid,uuid,uuid,bigint,text,text)','execute') then
    raise exception 'generation-attempt readback function privilege mismatch';
  end if;
  if has_table_privilege('authenticated','tongs.broll_generation_attempts','select,insert,update,delete')
     or not (select relrowsecurity and relforcerowsecurity
             from pg_class where oid='tongs.broll_generation_attempts'::regclass) then
    raise exception 'generation-attempt table security changed during readback repair';
  end if;
  if (select lifecycle_state from tongs.financial_environment_configuration_revisions
      where environment='live' order by revision desc limit 1)<>'inactive_ready' then
    raise exception 'Live changed during generation-attempt readback repair';
  end if;
end $$;

comment on function tongs.read_my_customer_runway_generation_attempt(uuid,uuid,uuid,uuid,bigint,text,text) is
  'Read-only recovery of the signed-in customer''s exact durable Runway generation-attempt identity. Creates no attempt, quote, reservation, charge, or provider action.';

notify pgrst,'reload schema';
commit;
