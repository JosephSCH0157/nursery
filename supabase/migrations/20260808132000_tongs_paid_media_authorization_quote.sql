begin;

create or replace function tongs.create_paid_media_authorization_quote(
  p_quote_id uuid,
  p_user_id uuid,
  p_operation_id text,
  p_tool text,
  p_workspace_id uuid,
  p_workpiece_id uuid,
  p_originating_entity_id text,
  p_prompt_revision_id uuid,
  p_prompt_content_hash text,
  p_prompt text,
  p_kind text,
  p_media_kind text,
  p_request_metadata jsonb,
  p_request_parameters jsonb,
  p_request_fingerprint text,
  p_effective_at timestamptz,
  p_expires_at timestamptz,
  p_pricing_policy_revision_id uuid,
  p_authorization_policy_revision_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_existing tongs.ai_credit_quotes%rowtype;
  v_prompt_bytes integer;
  v_output_count integer;
  v_size text;
  v_quality text;
  v_duration_seconds integer;
  v_provider text;
  v_model text;
  v_media_kind text;
  v_provider_native_rate numeric;
  v_provider_native_units bigint;
  v_provider_expense_micros bigint;
  v_basis bigint;
  v_ceiling bigint;
  v_params jsonb;
  v_expected text;
begin
  if p_user_id is null or p_quote_id is null or nullif(btrim(p_operation_id),'') is null
     or p_request_fingerprint !~ '^[0-9a-f]{64}$' or p_prompt_content_hash !~ '^[0-9a-f]{64}$'
     or nullif(p_prompt,'') is null or coalesce(jsonb_typeof(p_request_metadata),'null')<>'object'
     or coalesce(jsonb_typeof(p_request_parameters),'null')<>'object' then
    raise exception 'unsupported paid media authorization request' using errcode='22023';
  end if;

  v_prompt_bytes:=octet_length(convert_to(p_prompt,'utf8'));
  v_media_kind:=lower(coalesce(p_media_kind,'image'));

  if v_media_kind='image' then
    return tongs.create_paid_image_authorization_quote(
      p_quote_id,
      p_user_id,
      p_operation_id,
      p_tool,
      p_workspace_id,
      p_workpiece_id,
      p_originating_entity_id,
      p_prompt_revision_id,
      p_prompt_content_hash,
      p_prompt,
      coalesce(p_request_parameters->>'size','1024x1024'),
      coalesce(p_request_parameters->>'quality','medium'),
      coalesce((p_request_parameters->>'output_count')::integer,1),
      p_request_metadata,
      p_request_fingerprint,
      p_effective_at,
      p_expires_at
    );
  end if;

  if lower(coalesce(p_kind,'video'))<>'video' then
    raise exception 'unsupported paid media authorization kind' using errcode='22023';
  end if;

  v_duration_seconds:=coalesce((p_request_parameters->>'duration_seconds')::integer,5);
  if v_duration_seconds < 1 then
    v_duration_seconds:=1;
  end if;
  v_provider:=coalesce(p_request_metadata->>'provider','runway');
  v_model:=coalesce(p_request_parameters->>'model', coalesce(p_request_metadata->>'model','gen4.5'));
  v_provider_native_rate:=coalesce((p_request_parameters->>'provider_native_rate')::numeric,12);
  v_provider_native_units:=v_duration_seconds * coalesce(v_provider_native_rate,12)::bigint;
  v_provider_expense_micros:=v_duration_seconds * 120000;
  v_basis:=v_provider_expense_micros;
  v_ceiling:=ceil(v_basis::numeric * 21 / 125)::bigint;

  v_params:=jsonb_build_object(
    'provider',v_provider,
    'model',v_model,
    'generation_mode',coalesce(p_request_parameters->>'generation_mode','text_to_video'),
    'duration_seconds',v_duration_seconds,
    'ratio',coalesce(p_request_parameters->>'ratio','1280:720'),
    'operation',coalesce(p_request_parameters->>'operation','generation'),
    'metadata',p_request_metadata
  );
  v_expected:=encode(extensions.digest(convert_to(jsonb_build_object(
    'user_id',p_user_id,
    'operation_id',btrim(p_operation_id),
    'tool',btrim(p_tool),
    'workspace_id',p_workspace_id,
    'workpiece_id',p_workpiece_id,
    'originating_entity_id',p_originating_entity_id,
    'prompt_revision_id',p_prompt_revision_id,
    'prompt_content_hash',p_prompt_content_hash,
    'prompt_utf8_bytes',v_prompt_bytes,
    'request_parameters',v_params,
    'pricing_policy_revision_id',p_pricing_policy_revision_id,
    'authorization_policy_revision_id',p_authorization_policy_revision_id
  )::text,'utf8'),'sha256'),'hex');
  if v_expected<>p_request_fingerprint then
    raise exception 'paid media quote fingerprint mismatch' using errcode='22023',detail=v_expected;
  end if;

  select * into v_existing from tongs.ai_credit_quotes where user_id=p_user_id and operation_id=btrim(p_operation_id);
  if found then
    if v_existing.id<>p_quote_id or v_existing.request_fingerprint<>p_request_fingerprint then
      raise exception 'paid media quote replay conflict' using errcode='23505';
    end if;
    return jsonb_build_object('quote',to_jsonb(v_existing),'replay',true);
  end if;

  insert into tongs.ai_credit_quotes(
    id,user_id,operation_id,tool,workspace_id,workpiece_id,provider,model,media_kind,generation_mode,
    request_parameters,requested_output_count,provider_billable_units,pricing_policy_revision_id,pricing_policy_revision,
    estimated_provider_expense_micros,provider_currency,customer_credit_charge,reservation_amount,request_fingerprint,effective_at,expires_at,
    pricing_contract_version,estimated_provider_expense_numerator,estimated_provider_expense_denominator,maximum_provider_expense_numerator,
    maximum_provider_expense_denominator,estimated_customer_credit_charge,maximum_customer_credit_charge,
    authorization_policy_revision_id,authorization_policy_revision,prompt_revision_id,prompt_content_hash,prompt_utf8_bytes,
    known_image_output_tokens,known_image_output_expense_micros,authorization_text_contingency_micros,
    authorization_provider_expense_basis_micros,authorized_customer_ceiling)
  values(
    p_quote_id,
    p_user_id,
    btrim(p_operation_id),
    btrim(p_tool),
    p_workspace_id,
    p_workpiece_id,
    v_provider,
    v_model,
    'video',
    'text_to_video',
    v_params,
    1,
    v_provider_native_units,
    p_pricing_policy_revision_id,
    1,
    v_provider_expense_micros,
    'USD',
    v_provider_native_units,
    v_provider_native_units,
    p_request_fingerprint,
    p_effective_at,
    p_expires_at,
    'forge.paid-media.quote.v1',
    v_provider_expense_micros,
    1,
    v_provider_expense_micros,
    1,
    v_provider_native_units,
    v_provider_native_units,
    p_authorization_policy_revision_id,
    1,
    p_prompt_revision_id,
    p_prompt_content_hash,
    v_prompt_bytes,
    null,
    null,
    0,
    v_basis,
    v_ceiling
  ) returning * into v_existing;

  return jsonb_build_object('quote',to_jsonb(v_existing),'replay',false);
end $$;

grant execute on function tongs.create_paid_media_authorization_quote(uuid,uuid,text,text,uuid,uuid,text,uuid,text,text,text,text,jsonb,jsonb,text,timestamptz,timestamptz,uuid,uuid) to service_role;

commit;
