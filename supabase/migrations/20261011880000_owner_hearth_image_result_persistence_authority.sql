-- Slice 5A: add Forge-owner execution authority to the two canonical Hearth
-- OpenAI image result domains. This migration performs no provider execution,
-- creates no customer-finance object, and creates no accounting entry.
begin;

-- Fail before DDL if any historical image result is not exactly customer-backed.
do $$
declare
  v_thumbnail_ambiguous bigint;
  v_timeline_ambiguous bigint;
begin
  select count(*) into v_thumbnail_ambiguous
  from tongs.hearth_thumbnail_base_generation_results result
  left join tongs.funding_reservations reservation on reservation.id=result.reservation_id
  left join tongs.openai_text_funding_bindings binding
    on binding.operation_id=result.operation_id
   and binding.reservation_id=result.reservation_id
   and binding.route_code='hearth.thumbnail_base_generation'
  where result.reservation_id is null or reservation.id is null or binding.operation_id is null;

  select count(*) into v_timeline_ambiguous
  from tongs.hearth_timeline_image_generation_results result
  left join tongs.funding_reservations reservation on reservation.id=result.reservation_id
  left join tongs.openai_text_funding_bindings binding
    on binding.operation_id=result.operation_id
   and binding.reservation_id=result.reservation_id
   and binding.route_code='hearth.timeline_image_generation'
  where result.reservation_id is null or reservation.id is null or binding.operation_id is null;

  if v_thumbnail_ambiguous<>0 or v_timeline_ambiguous<>0 then
    raise exception 'owner image authority migration found ambiguous historical rows: thumbnail %, timeline %',
      v_thumbnail_ambiguous,v_timeline_ambiguous;
  end if;
end $$;

alter table tongs.hearth_thumbnail_base_generation_results
  drop constraint hearth_thumbnail_base_generation_results_operation_id_fkey,
  alter column reservation_id drop not null,
  add column owner_cost_attempt_id uuid,
  add column customer_operation_id text generated always as
    (case when reservation_id is not null then operation_id else null end) stored,
  add constraint hearth_thumbnail_base_results_owner_attempt_fkey
    foreign key(owner_cost_attempt_id)
    references tongs.owner_cost_provider_attempts(attempt_id) on delete restrict,
  add constraint hearth_thumbnail_base_results_customer_operation_fkey
    foreign key(customer_operation_id)
    references tongs.openai_text_funding_bindings(operation_id) on delete restrict,
  add constraint hearth_thumbnail_base_results_execution_authority_check
    check(num_nonnulls(reservation_id,owner_cost_attempt_id)=1);

create unique index hearth_thumbnail_base_results_owner_attempt_uidx
  on tongs.hearth_thumbnail_base_generation_results(owner_cost_attempt_id)
  where owner_cost_attempt_id is not null;

alter table tongs.hearth_timeline_image_generation_results
  drop constraint hearth_timeline_image_generation_results_operation_id_fkey,
  alter column reservation_id drop not null,
  add column owner_cost_attempt_id uuid,
  add column customer_operation_id text generated always as
    (case when reservation_id is not null then operation_id else null end) stored,
  add constraint hearth_timeline_image_results_owner_attempt_fkey
    foreign key(owner_cost_attempt_id)
    references tongs.owner_cost_provider_attempts(attempt_id) on delete restrict,
  add constraint hearth_timeline_image_results_customer_operation_fkey
    foreign key(customer_operation_id)
    references tongs.openai_text_funding_bindings(operation_id) on delete restrict,
  add constraint hearth_timeline_image_results_execution_authority_check
    check(num_nonnulls(reservation_id,owner_cost_attempt_id)=1);

create unique index hearth_timeline_image_results_owner_attempt_uidx
  on tongs.hearth_timeline_image_generation_results(owner_cost_attempt_id)
  where owner_cost_attempt_id is not null;

-- Customer rows retain the historic supplier-cost evidence. Owner rows derive
-- financial truth exclusively from owner-cost valuation -> canonical journal.
alter table tongs.hearth_timeline_image_generation_results
  alter column supplier_cost_micros drop not null,
  drop constraint hearth_timeline_image_generation_res_supplier_cost_micros_check,
  add constraint hearth_timeline_image_results_supplier_cost_authority_check check(
    (reservation_id is not null and supplier_cost_micros=334900)
    or (owner_cost_attempt_id is not null and supplier_cost_micros is null)
  );

create function tongs._assert_owner_hearth_image_result_authority(
  p_owner_cost_attempt_id uuid,p_route_code text,p_user_id uuid,
  p_workspace_id uuid,p_workpiece_id uuid,p_operation_fingerprint text,
  p_financial_environment text,p_runtime_environment text,
  p_provider_request_id text,p_model text,p_service text,p_sku text
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare
  v_authority jsonb;
  v_attempt tongs.owner_cost_provider_attempts%rowtype;
  v_provider_reference text;
  v_route text:=lower(btrim(coalesce(p_route_code,'')));
  v_expected_sku text;
begin
  perform tongs._require_accounting_service_role();
  v_expected_sku:=case v_route
    when 'hearth.thumbnail_base_generation'
      then 'gpt-image-2-2026-04-21:1536x1024:high:n1'
    when 'hearth.timeline_image_generation'
      then 'gpt-image-2-2026-04-21:1536x1024:high:n2'
    else null end;
  if v_expected_sku is null
     or p_model<>'gpt-image-2-2026-04-21'
     or p_service<>'image_generation'
     or p_sku<>v_expected_sku
     or nullif(btrim(coalesce(p_provider_request_id,'')),'') is null then
    raise exception 'invalid owner Hearth image provider contract' using errcode='22023';
  end if;

  v_authority:=tongs._assert_owner_hearth_result_authority(
    p_owner_cost_attempt_id,v_route,p_user_id,p_workspace_id,p_workpiece_id,
    p_operation_fingerprint,p_financial_environment,p_runtime_environment,
    p_provider_request_id,p_model
  );
  select * into v_attempt from tongs.owner_cost_provider_attempts
    where attempt_id=p_owner_cost_attempt_id;
  select event.provider_reference_id into v_provider_reference
    from tongs.owner_cost_attempt_events event
    where event.attempt_id=p_owner_cost_attempt_id
      and event.lifecycle_state in('response_captured','succeeded')
      and event.provider_reference_id is not null
    order by event.event_sequence desc limit 1;
  if v_attempt.provider<>'openai'
     or v_attempt.service<>p_service
     or v_attempt.model is distinct from p_model
     or v_attempt.sku is distinct from p_sku
     or v_provider_reference is distinct from btrim(p_provider_request_id) then
    raise exception 'owner Hearth image provider authority mismatch' using errcode='42501';
  end if;
  return v_authority||jsonb_build_object('service',p_service,'sku',p_sku);
end $$;

create function tongs.record_owner_hearth_thumbnail_base_generation_result(
  p_owner_cost_attempt_id uuid,p_user_id uuid,p_workspace_id uuid,p_workpiece_id uuid,
  p_operation_fingerprint text,p_financial_environment text,p_runtime_environment text,
  p_provider_body_sha256 text,p_prompt_package_hash text,p_render_recipe_id uuid,
  p_render_recipe_revision integer,p_concept_revision_id uuid,p_provider_request_id text,
  p_provider_response_id text,p_staged_asset_id uuid,p_canonical_receipt_json jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_authority jsonb;
  v_operation_key text;
  v_asset tongs.assets%rowtype;
  v_existing tongs.hearth_thumbnail_base_generation_results%rowtype;
  v_result_id uuid:=extensions.uuid_generate_v5(
    '19630000-0000-4000-8000-000000000012'::uuid,p_owner_cost_attempt_id::text);
begin
  perform tongs._require_accounting_service_role();
  v_authority:=tongs._assert_owner_hearth_image_result_authority(
    p_owner_cost_attempt_id,'hearth.thumbnail_base_generation',p_user_id,
    p_workspace_id,p_workpiece_id,p_operation_fingerprint,p_financial_environment,
    p_runtime_environment,p_provider_request_id,'gpt-image-2-2026-04-21',
    'image_generation','gpt-image-2-2026-04-21:1536x1024:high:n1'
  );
  v_operation_key:=v_authority->>'operation_key';
  if lower(coalesce(p_provider_body_sha256,''))!~'^[0-9a-f]{64}$'
     or lower(coalesce(p_prompt_package_hash,''))!~'^[0-9a-f]{64}$'
     or p_render_recipe_id is null or p_render_recipe_revision<=0
     or p_concept_revision_id is null or p_staged_asset_id is null
     or jsonb_typeof(coalesce(p_canonical_receipt_json,'null'::jsonb))<>'object' then
    raise exception 'invalid owner Thumbnail Base result evidence' using errcode='22023';
  end if;
  select * into v_asset from tongs.assets where id=p_staged_asset_id;
  if v_asset.id is null or v_asset.workspace_id<>p_workspace_id
     or v_asset.workpiece_id<>p_workpiece_id or v_asset.request_id<>v_operation_key
     or v_asset.asset_kind<>'thumbnail_image'
     or v_asset.provider<>'openai' or v_asset.provider_request_id is distinct from btrim(p_provider_request_id)
     or v_asset.mime_type<>'image/png' or v_asset.status<>'ready'
     or v_asset.content_hash!~'^[0-9a-f]{64}$'
     or p_canonical_receipt_json->>'asset_id' is distinct from v_asset.id::text
     or p_canonical_receipt_json->>'asset_path' is distinct from v_asset.path
     or p_canonical_receipt_json->>'asset_content_hash' is distinct from v_asset.content_hash
     or p_canonical_receipt_json->>'provider_body_sha256' is distinct from lower(p_provider_body_sha256)
     or p_canonical_receipt_json->>'prompt_package_hash' is distinct from lower(p_prompt_package_hash) then
    raise exception 'owner Thumbnail Base result conflicts with canonical asset authority' using errcode='42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'owner-thumbnail-base-result:'||p_owner_cost_attempt_id::text,0));
  select * into v_existing from tongs.hearth_thumbnail_base_generation_results
    where owner_cost_attempt_id=p_owner_cost_attempt_id or operation_id=v_operation_key;
  if found then
    if v_existing.owner_cost_attempt_id is distinct from p_owner_cost_attempt_id
       or v_existing.operation_id<>v_operation_key
       or v_existing.request_fingerprint<>lower(p_operation_fingerprint)
       or v_existing.provider_body_sha256<>lower(p_provider_body_sha256)
       or v_existing.prompt_package_hash<>lower(p_prompt_package_hash)
       or v_existing.render_recipe_id<>p_render_recipe_id
       or v_existing.render_recipe_revision<>p_render_recipe_revision
       or v_existing.concept_revision_id<>p_concept_revision_id
       or v_existing.provider_request_id is distinct from btrim(p_provider_request_id)
       or v_existing.provider_response_id is distinct from nullif(btrim(coalesce(p_provider_response_id,'')),'')
       or v_existing.staged_asset_id<>p_staged_asset_id
       or v_existing.canonical_receipt_json<>p_canonical_receipt_json then
      raise exception 'owner Thumbnail Base result replay conflict' using errcode='23505';
    end if;
    return to_jsonb(v_existing)||jsonb_build_object('replay',true,'authority','owner_cost_provider_attempt');
  end if;

  insert into tongs.hearth_thumbnail_base_generation_results(
    id,operation_id,reservation_id,owner_cost_attempt_id,user_id,workspace_id,workpiece_id,
    request_fingerprint,provider_body_sha256,prompt_package_hash,render_recipe_id,
    render_recipe_revision,concept_revision_id,provider_request_id,provider_response_id,
    generated_content_hash,staged_asset_id,staged_asset_path,canonical_receipt_json,state,completed_at
  ) values(
    v_result_id,v_operation_key,null,p_owner_cost_attempt_id,p_user_id,p_workspace_id,p_workpiece_id,
    lower(p_operation_fingerprint),lower(p_provider_body_sha256),lower(p_prompt_package_hash),
    p_render_recipe_id,p_render_recipe_revision,p_concept_revision_id,btrim(p_provider_request_id),
    nullif(btrim(coalesce(p_provider_response_id,'')),''),v_asset.content_hash,v_asset.id,v_asset.path,
    p_canonical_receipt_json,'asset_staged',transaction_timestamp()
  ) returning * into v_existing;
  return to_jsonb(v_existing)||jsonb_build_object('replay',false,'authority','owner_cost_provider_attempt');
end $$;

create function tongs.stage_owner_timeline_image_generation_result(
  p_owner_cost_attempt_id uuid,p_user_id uuid,p_workspace_id uuid,p_workpiece_id uuid,
  p_operation_fingerprint text,p_financial_environment text,p_runtime_environment text,
  p_provider_body_sha256 text,p_provider_request_id text,p_provider_response_id text,
  p_prompt_revision_id uuid,p_prompt_content_hash text,p_semantic_authority_hash text,
  p_image_moment_id text,p_outputs jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_authority jsonb;
  v_operation_key text;
  v_prompt tongs.image_map_prompt_revisions%rowtype;
  v_existing tongs.hearth_timeline_image_generation_results%rowtype;
  v_result_id uuid:=extensions.uuid_generate_v5(
    '19670000-0000-4000-8000-000000000011'::uuid,p_owner_cost_attempt_id::text);
  v_item jsonb;
begin
  perform tongs._require_accounting_service_role();
  v_authority:=tongs._assert_owner_hearth_image_result_authority(
    p_owner_cost_attempt_id,'hearth.timeline_image_generation',p_user_id,
    p_workspace_id,p_workpiece_id,p_operation_fingerprint,p_financial_environment,
    p_runtime_environment,p_provider_request_id,'gpt-image-2-2026-04-21',
    'image_generation','gpt-image-2-2026-04-21:1536x1024:high:n2'
  );
  v_operation_key:=v_authority->>'operation_key';
  select * into v_prompt from tongs.image_map_prompt_revisions where id=p_prompt_revision_id;
  if lower(coalesce(p_provider_body_sha256,''))!~'^[0-9a-f]{64}$'
     or lower(coalesce(p_prompt_content_hash,''))!~'^[0-9a-f]{64}$'
     or lower(coalesce(p_semantic_authority_hash,''))!~'^[0-9a-f]{64}$'
     or nullif(btrim(coalesce(p_image_moment_id,'')),'') is null
     or v_prompt.id is null or v_prompt.workspace_id<>p_workspace_id
     or v_prompt.workpiece_id<>p_workpiece_id
     or v_prompt.image_moment_id<>btrim(p_image_moment_id)
     or v_prompt.content_hash<>lower(p_prompt_content_hash)
     or jsonb_typeof(coalesce(p_outputs,'null'::jsonb))<>'array'
     or jsonb_array_length(p_outputs)<>2
     or (select array_agg((value->>'child_ordinal')::integer order by (value->>'child_ordinal')::integer)
           from jsonb_array_elements(p_outputs))<>array[1,2]
     or exists(select 1 from jsonb_array_elements(p_outputs) output
       where output->>'mime_type'<>'image/png'
          or nullif(output->>'bytes_base64','') is null
          or nullif(output->>'staged_asset_id','') is null) then
    raise exception 'invalid owner Timeline Image result evidence' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'owner-timeline-image-result:'||p_owner_cost_attempt_id::text,0));
  select * into v_existing from tongs.hearth_timeline_image_generation_results
    where owner_cost_attempt_id=p_owner_cost_attempt_id or operation_id=v_operation_key;
  if found then
    if v_existing.owner_cost_attempt_id is distinct from p_owner_cost_attempt_id
       or v_existing.operation_id<>v_operation_key
       or v_existing.request_fingerprint<>lower(p_operation_fingerprint)
       or v_existing.provider_body_sha256<>lower(p_provider_body_sha256)
       or v_existing.provider_request_id is distinct from btrim(p_provider_request_id)
       or v_existing.provider_response_id is distinct from nullif(btrim(coalesce(p_provider_response_id,'')),'')
       or v_existing.prompt_revision_id<>p_prompt_revision_id
       or v_existing.prompt_content_hash<>lower(p_prompt_content_hash)
       or v_existing.semantic_authority_hash<>lower(p_semantic_authority_hash)
       or v_existing.image_moment_id<>btrim(p_image_moment_id) then
      raise exception 'owner Timeline Image result replay conflict' using errcode='23505';
    end if;
    if (select count(*) from tongs.hearth_timeline_image_generation_outputs output
        where output.result_id=v_existing.id)<>2 then
      raise exception 'owner Timeline Image replay is incomplete' using errcode='23505';
    end if;
    if exists(
      select 1
      from jsonb_array_elements(p_outputs) item
      left join tongs.hearth_timeline_image_generation_outputs output
        on output.result_id=v_existing.id
       and output.child_ordinal=(item->>'child_ordinal')::integer
      where output.result_id is null
         or output.bytes_base64<>item->>'bytes_base64'
         or output.staged_asset_id<>(item->>'staged_asset_id')::uuid
         or output.content_hash<>encode(extensions.digest(
              decode(item->>'bytes_base64','base64'),'sha256'),'hex')
    ) then
      raise exception 'owner Timeline Image output replay conflict' using errcode='23505';
    end if;
    return to_jsonb(v_existing)||jsonb_build_object('replay',true,'authority','owner_cost_provider_attempt');
  end if;

  insert into tongs.hearth_timeline_image_generation_results(
    id,operation_id,reservation_id,owner_cost_attempt_id,user_id,workspace_id,workpiece_id,
    image_moment_id,request_fingerprint,provider_body_sha256,provider_request_id,
    provider_response_id,model,prompt_revision_id,prompt_content_hash,semantic_authority_hash,
    image_count,provider_attempt_count,supplier_cost_micros
  ) values(
    v_result_id,v_operation_key,null,p_owner_cost_attempt_id,p_user_id,p_workspace_id,p_workpiece_id,
    btrim(p_image_moment_id),lower(p_operation_fingerprint),lower(p_provider_body_sha256),
    btrim(p_provider_request_id),nullif(btrim(coalesce(p_provider_response_id,'')),''),
    'gpt-image-2-2026-04-21',p_prompt_revision_id,lower(p_prompt_content_hash),
    lower(p_semantic_authority_hash),2,1,null
  ) returning * into v_existing;
  for v_item in select * from jsonb_array_elements(p_outputs) loop
    insert into tongs.hearth_timeline_image_generation_outputs(
      result_id,child_ordinal,bytes_base64,content_hash,mime_type,staged_asset_id,staged_asset_path
    ) values(
      v_result_id,(v_item->>'child_ordinal')::integer,v_item->>'bytes_base64',
      encode(extensions.digest(decode(v_item->>'bytes_base64','base64'),'sha256'),'hex'),
      'image/png',(v_item->>'staged_asset_id')::uuid,
      'assets/image-map/candidates/'||p_workpiece_id||'/'||btrim(p_image_moment_id)||'/'
        ||(v_item->>'staged_asset_id')||'-candidate-'||(v_item->>'child_ordinal')||'.png'
    );
  end loop;
  return to_jsonb(v_existing)||jsonb_build_object('replay',false,'authority','owner_cost_provider_attempt');
end $$;

create function tongs.finalize_owner_timeline_image_generation_result(
  p_owner_cost_attempt_id uuid,p_operation_fingerprint text,
  p_image_map_revision_id uuid,p_asset_ids uuid[]
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_parent tongs.hearth_timeline_image_generation_results%rowtype;
  v_receipt tongs.hearth_timeline_image_generation_delivery_receipts%rowtype;
begin
  perform tongs._require_accounting_service_role();
  perform pg_advisory_xact_lock(hashtextextended(
    'owner-timeline-image-finalize:'||p_owner_cost_attempt_id::text,0));
  select * into v_parent from tongs.hearth_timeline_image_generation_results
    where owner_cost_attempt_id=p_owner_cost_attempt_id
      and request_fingerprint=lower(p_operation_fingerprint);
  if v_parent.id is null or cardinality(p_asset_ids)<>2
     or (select count(*) from tongs.hearth_timeline_image_generation_outputs output
          where output.result_id=v_parent.id and output.staged_asset_id=any(p_asset_ids))<>2
     or (select count(*) from tongs.assets asset
          where asset.id=any(p_asset_ids) and asset.status='ready'
            and asset.workspace_id=v_parent.workspace_id and asset.workpiece_id=v_parent.workpiece_id
            and asset.asset_kind='image_map_candidate_image'
            and asset.provider='openai'
            and asset.request_id=v_parent.operation_id
            and asset.provider_request_id is not distinct from v_parent.provider_request_id)<>2
     or not exists(
          select 1 from tongs.image_map_revisions revision
          where revision.id=p_image_map_revision_id
            and revision.workspace_id=v_parent.workspace_id
            and revision.workpiece_id=v_parent.workpiece_id) then
    raise exception 'owner Timeline Image canonical delivery is incomplete' using errcode='22023';
  end if;
  select * into v_receipt from tongs.hearth_timeline_image_generation_delivery_receipts
    where result_id=v_parent.id;
  if found then
    if v_receipt.image_map_revision_id<>p_image_map_revision_id
       or v_receipt.asset_ids<>p_asset_ids then
      raise exception 'owner Timeline Image finalization replay conflict' using errcode='23505';
    end if;
    return to_jsonb(v_receipt)||jsonb_build_object('replay',true,'authority','owner_cost_provider_attempt');
  end if;
  insert into tongs.hearth_timeline_image_generation_delivery_receipts(
    result_id,image_map_revision_id,asset_ids
  ) values(v_parent.id,p_image_map_revision_id,p_asset_ids) returning * into v_receipt;
  return to_jsonb(v_receipt)||jsonb_build_object('replay',false,'authority','owner_cost_provider_attempt');
end $$;

create function tongs.read_owner_hearth_image_result(
  p_owner_cost_attempt_id uuid,p_route_code text
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare
  v_result jsonb;
  v_route text:=lower(btrim(coalesce(p_route_code,'')));
begin
  perform tongs._require_owner_cost_reader();
  if v_route='hearth.thumbnail_base_generation' then
    select to_jsonb(result)||jsonb_build_object(
      'owner_operation',jsonb_build_object(
        'operation_id',operation.operation_id,'operation_key',operation.operation_key,
        'workspace_id',operation.workspace_id,'workpiece_id',operation.workpiece_id,
        'financial_environment',operation.financial_environment,
        'runtime_environment',operation.runtime_environment),
      'valuations',coalesce((select jsonb_agg(to_jsonb(valuation) order by valuation.revision)
        from tongs.owner_cost_valuations valuation where valuation.attempt_id=attempt.attempt_id),'[]'::jsonb)
    ) into v_result
    from tongs.hearth_thumbnail_base_generation_results result
    join tongs.owner_cost_provider_attempts attempt on attempt.attempt_id=result.owner_cost_attempt_id
    join tongs.owner_cost_operations operation on operation.operation_id=attempt.operation_id
    where result.owner_cost_attempt_id=p_owner_cost_attempt_id;
  elsif v_route='hearth.timeline_image_generation' then
    select to_jsonb(result)||jsonb_build_object(
      'outputs',coalesce((select jsonb_agg(to_jsonb(output) order by output.child_ordinal)
        from tongs.hearth_timeline_image_generation_outputs output where output.result_id=result.id),'[]'::jsonb),
      'canonical_receipt',case when receipt.result_id is null then null else to_jsonb(receipt) end,
      'owner_operation',jsonb_build_object(
        'operation_id',operation.operation_id,'operation_key',operation.operation_key,
        'workspace_id',operation.workspace_id,'workpiece_id',operation.workpiece_id,
        'financial_environment',operation.financial_environment,
        'runtime_environment',operation.runtime_environment),
      'valuations',coalesce((select jsonb_agg(to_jsonb(valuation) order by valuation.revision)
        from tongs.owner_cost_valuations valuation where valuation.attempt_id=attempt.attempt_id),'[]'::jsonb)
    ) into v_result
    from tongs.hearth_timeline_image_generation_results result
    join tongs.owner_cost_provider_attempts attempt on attempt.attempt_id=result.owner_cost_attempt_id
    join tongs.owner_cost_operations operation on operation.operation_id=attempt.operation_id
    left join tongs.hearth_timeline_image_generation_delivery_receipts receipt on receipt.result_id=result.id
    where result.owner_cost_attempt_id=p_owner_cost_attempt_id;
  else
    raise exception 'unsupported owner Hearth image result route' using errcode='22023';
  end if;
  return v_result;
end $$;

revoke all on function tongs._assert_owner_hearth_image_result_authority(uuid,text,uuid,uuid,uuid,text,text,text,text,text,text,text)
  from public,anon,authenticated,service_role;
revoke all on function tongs.record_owner_hearth_thumbnail_base_generation_result(uuid,uuid,uuid,uuid,text,text,text,text,text,uuid,integer,uuid,text,text,uuid,jsonb)
  from public,anon,authenticated;
revoke all on function tongs.stage_owner_timeline_image_generation_result(uuid,uuid,uuid,uuid,text,text,text,text,text,text,uuid,text,text,text,jsonb)
  from public,anon,authenticated;
revoke all on function tongs.finalize_owner_timeline_image_generation_result(uuid,text,uuid,uuid[])
  from public,anon,authenticated;
revoke all on function tongs.read_owner_hearth_image_result(uuid,text)
  from public,anon;

grant execute on function tongs.record_owner_hearth_thumbnail_base_generation_result(uuid,uuid,uuid,uuid,text,text,text,text,text,uuid,integer,uuid,text,text,uuid,jsonb)
  to service_role;
grant execute on function tongs.stage_owner_timeline_image_generation_result(uuid,uuid,uuid,uuid,text,text,text,text,text,text,uuid,text,text,text,jsonb)
  to service_role;
grant execute on function tongs.finalize_owner_timeline_image_generation_result(uuid,text,uuid,uuid[])
  to service_role;
grant execute on function tongs.read_owner_hearth_image_result(uuid,text)
  to authenticated,service_role;

comment on column tongs.hearth_thumbnail_base_generation_results.owner_cost_attempt_id is
  'Mutually exclusive Forge owner execution authority; never a customer reservation, balance, or asset identity.';
comment on column tongs.hearth_timeline_image_generation_results.owner_cost_attempt_id is
  'Mutually exclusive Forge owner execution authority; financial truth remains owner-cost valuation and canonical journal.';
comment on function tongs.record_owner_hearth_thumbnail_base_generation_result(uuid,uuid,uuid,uuid,text,text,text,text,text,uuid,integer,uuid,text,text,uuid,jsonb) is
  'Private service-only owner Thumbnail Base persistence; reads no customer-finance authority.';
comment on function tongs.stage_owner_timeline_image_generation_result(uuid,uuid,uuid,uuid,text,text,text,text,text,text,uuid,text,text,text,jsonb) is
  'Private service-only owner Timeline Image staging; reads no customer-finance authority.';

notify pgrst,'reload schema';
commit;
