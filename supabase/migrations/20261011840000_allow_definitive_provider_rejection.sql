create or replace function tongs.append_owner_cost_attempt_event(
  p_attempt_event_id uuid,
  p_attempt_id uuid,
  p_event_sequence integer,
  p_lifecycle_state text,
  p_provider_reference_id text,
  p_normalized_usage_evidence jsonb,
  p_private_provider_evidence jsonb,
  p_occurred_at timestamptz
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_state text := lower(btrim(coalesce(p_lifecycle_state, '')));
  v_previous text;
  v_existing tongs.owner_cost_attempt_events%rowtype;
begin
  perform tongs._require_accounting_service_role();
  if p_attempt_event_id is null or p_attempt_id is null or p_event_sequence <= 1
     or v_state not in ('submitted', 'response_captured', 'succeeded', 'definitively_rejected', 'failed', 'submission_unknown')
     or p_occurred_at is null
     or jsonb_typeof(coalesce(p_normalized_usage_evidence, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_private_provider_evidence, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid owner-cost attempt event' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('owner-cost-attempt-events:' || p_attempt_id::text, 0));
  select * into v_existing from tongs.owner_cost_attempt_events e
    where e.attempt_event_id = p_attempt_event_id
       or (e.attempt_id = p_attempt_id and e.event_sequence = p_event_sequence)
    limit 1;
  if found then
    if v_existing.attempt_event_id <> p_attempt_event_id or v_existing.lifecycle_state <> v_state
       or v_existing.provider_reference_id is distinct from nullif(btrim(coalesce(p_provider_reference_id, '')), '')
       or v_existing.normalized_usage_evidence <> coalesce(p_normalized_usage_evidence, '{}'::jsonb)
       or v_existing.private_provider_evidence <> coalesce(p_private_provider_evidence, '{}'::jsonb)
       or v_existing.occurred_at <> coalesce(p_occurred_at, v_existing.occurred_at) then
      raise exception 'owner-cost attempt event replay conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('attempt_event_id', v_existing.attempt_event_id, 'replay', true, 'provider_submission_created', false);
  end if;
  select e.lifecycle_state into v_previous from tongs.owner_cost_attempt_events e
    where e.attempt_id = p_attempt_id order by e.event_sequence desc limit 1;
  if not found then raise exception 'owner-cost attempt not found' using errcode = '23503'; end if;
  if p_event_sequence <> (select max(e.event_sequence) + 1 from tongs.owner_cost_attempt_events e where e.attempt_id = p_attempt_id) then
    raise exception 'owner-cost attempt event sequence gap' using errcode = '23514';
  end if;
  if not (
    (v_previous = 'authorized' and v_state in ('submitted', 'failed')) or
    (v_previous = 'submitted' and v_state in ('response_captured', 'succeeded', 'definitively_rejected', 'failed', 'submission_unknown')) or
    (v_previous = 'submission_unknown' and v_state in ('response_captured', 'succeeded', 'failed')) or
    (v_previous = 'response_captured' and v_state in ('succeeded', 'failed'))
  ) then raise exception 'invalid owner-cost attempt lifecycle transition' using errcode = '23514'; end if;
  insert into tongs.owner_cost_attempt_events(
    attempt_event_id, attempt_id, event_sequence, lifecycle_state, provider_reference_id,
    normalized_usage_evidence, private_provider_evidence, occurred_at
  ) values (
    p_attempt_event_id, p_attempt_id, p_event_sequence, v_state,
    nullif(btrim(coalesce(p_provider_reference_id, '')), ''),
    coalesce(p_normalized_usage_evidence, '{}'::jsonb),
    coalesce(p_private_provider_evidence, '{}'::jsonb), p_occurred_at
  );
  return jsonb_build_object(
    'attempt_event_id', p_attempt_event_id, 'replay', false,
    'provider_submission_created', v_state = 'submitted'
  );
end;
$$;
