begin;

create or replace function tongs._paid_media_usage_contract_is_video(p_usage_components jsonb)
returns boolean language sql stable as $$
  select coalesce(
    jsonb_typeof(p_usage_components) = 'array'
    and jsonb_array_length(p_usage_components) = 1
    and (p_usage_components->0->>'component_kind') = 'video_output'
    and (p_usage_components->0->>'unit_kind') = 'second',
    false
  );
$$;

create or replace function tongs._paid_media_usage_contract_is_image(p_usage_components jsonb)
returns boolean language sql stable as $$
  select coalesce(
    jsonb_typeof(p_usage_components) = 'array'
    and jsonb_array_length(p_usage_components) >= 2
    and exists (
      select 1 from jsonb_array_elements(p_usage_components) as c
      where c->>'component_kind' = 'text_input'
    )
    and exists (
      select 1 from jsonb_array_elements(p_usage_components) as c
      where c->>'component_kind' = 'image_output'
    ),
    false
  );
$$;

create or replace function tongs._valid_paid_media_usage_components(p_usage_components jsonb)
returns boolean language sql stable as $$
  select (
    jsonb_typeof(p_usage_components) = 'array'
    and jsonb_array_length(p_usage_components) > 0
    and not exists (
      select 1
      from jsonb_array_elements(p_usage_components) as c
      where nullif(btrim(c->>'component_kind'), '') is null
        or nullif(btrim(c->>'unit_kind'), '') is null
        or coalesce((c->>'quantity')::bigint, -1) < 0
    )
    and (
      tongs._paid_media_usage_contract_is_image(p_usage_components)
      or tongs._paid_media_usage_contract_is_video(p_usage_components)
    )
  );
$$;

create or replace function tongs.record_paid_media_provider_result(
  p_paid_media_operation_id uuid,
  p_operation_fingerprint text,
  p_attempt_id uuid,
  p_provider_request_id text,
  p_provider_response_id text,
  p_provider_response_json jsonb,
  p_usage_components jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_op tongs.paid_media_operations%rowtype;
  v_attempt tongs.paid_media_provider_attempts%rowtype;
  v_component jsonb;
  v_rate record;
  v_contract text;
begin
  select * into v_op from tongs.paid_media_operations where id=p_paid_media_operation_id for update;
  if not found or v_op.operation_fingerprint<>p_operation_fingerprint then
    raise exception 'paid operation not found or mismatched' using errcode='P0002';
  end if;

  select * into v_attempt from tongs.paid_media_provider_attempts where id=p_attempt_id and paid_media_operation_id=v_op.id for update;
  if not found then
    raise exception 'provider attempt not found' using errcode='P0002';
  end if;
  if v_attempt.state='completed' then
    return jsonb_build_object('operation', to_jsonb(v_op), 'attempt', to_jsonb(v_attempt), 'replay', true);
  end if;
  if v_attempt.state not in ('submitting','evidence_recorded') then
    raise exception 'provider attempt is not recoverable' using errcode='P0001';
  end if;
  if jsonb_typeof(p_provider_response_json)<>'object' or not tongs._valid_paid_media_usage_components(p_usage_components) then
    raise exception 'invalid provider result evidence' using errcode='22023';
  end if;

  update tongs.paid_media_provider_attempts
  set state='completed', transmitted=true, provider_request_id=p_provider_request_id,
      provider_response_id=p_provider_response_id, provider_response_json=p_provider_response_json, completed_at=now()
  where id=v_attempt.id returning * into v_attempt;

  for v_component in select value from jsonb_array_elements(p_usage_components) loop
    select c.* into v_rate
    from tongs.ai_pricing_rate_components c
    where c.pricing_policy_revision_id=v_op.pricing_policy_revision_id
      and c.component_kind=v_component->>'component_kind';
    if not found or coalesce((v_component->>'quantity')::bigint,-1)<0 then
      raise exception 'invalid actual usage component' using errcode='22023';
    end if;

    insert into tongs.paid_media_actual_usage_components(
      provider_attempt_id, component_kind, quantity, rate_numerator, rate_denominator,
      expense_numerator, expense_denominator, evidence_json
    )
    values(
      v_attempt.id,
      v_rate.component_kind,
      (v_component->>'quantity')::bigint,
      v_rate.rate_numerator,
      v_rate.rate_denominator,
      (v_component->>'quantity')::numeric * v_rate.rate_numerator,
      v_rate.rate_denominator,
      v_component
    );
  end loop;

  if not exists(select 1 from tongs.paid_media_actual_usage_components where provider_attempt_id=v_attempt.id) then
    raise exception 'provider result is missing authoritative usage' using errcode='22023';
  end if;

  if tongs._paid_media_usage_contract_is_video(p_usage_components) then
    v_contract := 'forge.paid-media.usage.video.v1';
  elsif tongs._paid_media_usage_contract_is_image(p_usage_components) then
    v_contract := 'forge.paid-media.usage.image.v1';
  else
    raise exception 'provider result is missing authoritative usage' using errcode='22023';
  end if;

  update tongs.paid_media_operations
  set state=case when state='delivered' then 'delivered' else 'provider_completed' end,
      failure_code=null,
      failure_message=null,
      reconciliation_required=false,
      updated_at=now()
  where id=v_op.id returning * into v_op;

  insert into tongs.paid_media_operation_events
  values(
    gen_random_uuid(),
    v_op.id,
    v_op.user_id,
    'provider_usage_reconciled',
    (select coalesce(max(event_ordinal), 0)+1 from tongs.paid_media_operation_events where paid_media_operation_id=v_op.id),
    jsonb_build_object(
      'attempt_id', v_attempt.id,
      'provider_request_id', p_provider_request_id,
      'provider_response_id', p_provider_response_id,
      'usage_contract', v_contract
    ),
    v_op.actor_id,
    now()
  );

  return jsonb_build_object('operation', to_jsonb(v_op), 'attempt', to_jsonb(v_attempt), 'replay', false);
end $$;

grant execute on function tongs.record_paid_media_provider_result(uuid,text,uuid,text,text,jsonb,jsonb) to service_role;

commit;
