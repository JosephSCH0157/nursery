-- Dedicated one-request/two-output Timeline Image Test product. Legacy
-- hearth_episode_images authority and evidence remain historical and unchanged.
begin;

do $$ begin
  if not exists(select 1 from tongs.openai_text_model_catalog_revisions where revision=14 and lifecycle_state='active')
    then raise exception 'active model catalog revision 14 is unavailable'; end if;
  if not exists(select 1 from tongs.openai_text_provider_rate_revisions where id='19630000-0000-4000-8000-000000000001'
    and runtime_model_alias='gpt-image-2-2026-04-21' and output_micros_per_million_tokens=167450000000)
    then raise exception 'exact GPT Image 2 rate evidence is unavailable'; end if;
  if exists(select 1 from tongs.openai_text_route_policies where route_code='hearth.timeline_image_generation')
    then raise exception 'Timeline Image route already exists'; end if;
  if (select lifecycle_state from tongs.financial_environment_configuration_revisions where environment='live' order by revision desc limit 1)<>'inactive_ready'
    then raise exception 'Live must remain inactive-ready'; end if;
end $$;

insert into tongs.openai_text_route_policies(route_code,product_area,provider_operation,maximum_input_units,maximum_output_units,
  maximum_attempts,requires_result_validation,requires_canonical_persistence,byo_supported,rollout_mode,notes)
values('hearth.timeline_image_generation','hearth','responses',16384,2,1,true,true,false,'inactive',
  'One POST /v1/images/generations request: pinned GPT Image 2, n=2, 1536x1024, high PNG, zero references, one attempt, no fallback; Test only.');

insert into tongs.openai_text_cost_policy_revisions(id,route_code,revision,policy_code,attempt_plan,maximum_input_units,
  maximum_output_units,maximum_attempts,direct_provider_ceiling_micros,supporting_cost_ceiling_micros,
  full_cost_ceiling_micros,cost_coverage,lifecycle_state,notes)
values('19670000-0000-4000-8000-000000000001','hearth.timeline_image_generation',1,
  'openai-image:hearth-timeline-image-generation:test-v1',
  '[{"attempt":1,"rate_revision_id":"19630000-0000-4000-8000-000000000001","runtime_model":"gpt-image-2-2026-04-21","provider_model_id":"gpt-image-2-2026-04-21","endpoint":"/v1/images/generations","size":"1536x1024","quality":"high","output_format":"png","image_count":2,"reference_images":0}]',
  16384,2,1,334900,0,334900,'complete','active',
  'Two 167450-micro image ceilings in exactly one n=2 request. Supporting variable cost is zero.');
insert into tongs.openai_text_supporting_cost_inventory(id,route_code,cost_policy_revision_id,component_code,disposition,evidence_status,notes) values
('19670000-0000-4000-8000-000000000002','hearth.timeline_image_generation','19670000-0000-4000-8000-000000000001','openai_timeline_image_generation','attributable_metered','verified','One pinned n=2 OpenAI image request is the only metered supplier cost.'),
('19670000-0000-4000-8000-000000000003','hearth.timeline_image_generation','19670000-0000-4000-8000-000000000001','canonical_delivery_and_retention','platform_overhead','verified','Staging, canonical attachment, and evidence retention have no verified variable allocation.');

do $$ declare actor uuid; previous_catalog_id uuid; catalog_id constant uuid:='19670000-0000-4000-8000-000000000008';
  policy_id constant uuid:='19670000-0000-4000-8000-000000000004'; pricing_id constant uuid:='19670000-0000-4000-8000-000000000005';
  cost_id constant uuid:='19670000-0000-4000-8000-000000000001';
  sku constant text:='openai-image:hearth.timeline_image_generation:gpt-image-2-2026-04-21:19670000-0000-4000-8000-000000000001';
begin
  select user_id into actor from tongs.platform_operators order by granted_at limit 1;
  if actor is null then raise exception 'platform operator required'; end if;
  insert into tongs.private_pricing_policies(id,policy_code,scope_kind,provider,sku,created_by)
  values(policy_id,'forge-hearth-timeline-image-test-gpt-image-2-v1','sku','openai',sku,actor);
  insert into tongs.private_pricing_revisions(id,policy_id,revision,previous_revision_id,lifecycle_state,currency,markup_basis_points,
    full_cost_ceiling_micros,failure_cost_ceiling_micros,customer_price_ceiling_micros,billable_failure_ceiling_micros,
    customer_credit_units,billable_failure_classes,free_failure_classes,included_quantity,retention_policy,change_reason,
    content_hash,actor_id,unrounded_customer_price_micros,rounding_adjustment_micros,settled_customer_price_micros)
  values(pricing_id,policy_id,1,null,'review_ready','USD',3300,334900,0,450000,0,90,'[]',
    '["pre_provider_rejection","provider_failure","forge_failure","validation_failure","persistence_failure"]',
    '{"images":2,"provider_requests":1,"size":"1536x1024","quality":"high","format":"png","provider_attempts":1,"reference_images":0,"fallback_providers":0}',
    '{"provider_outputs":"restricted_immutable","generated_bytes":"restricted_recoverable","canonical_image_map":"platform_overhead"}',
    'Approved 90-credit Test Timeline Image product. 33% target is 445417 micros and settles at 450000 micros.',
    encode(extensions.digest(convert_to('timeline-image-v1:334900:445417:4583:450000:90','utf8'),'sha256'),'hex'),actor,445417,4583,450000);
  insert into tongs.private_pricing_cost_components(pricing_revision_id,ordinal,component_code,component_kind,credential_funding,
    provider_label,success_ceiling_micros,failure_ceiling_micros,cost_policy_revision,tail_policy,tail_policy_details) values
    (pricing_id,1,'openai_timeline_image_generation','direct_provider','forge','OpenAI',334900,334900,'GPT Image 2 schedule checked 2026-09-23','none','{"endpoint":"/v1/images/generations","size":"1536x1024","quality":"high","images":2,"requests":1}'),
    (pricing_id,2,'verified_variable_supporting_cost','compute','forge','Forge',0,0,'Direct-only approved basis 2026-09-24','none','{"verified_attributable_variable_micros":0}');
  insert into tongs.private_pricing_revision_markup_sources(pricing_revision_id,markup_rule_revision_id,effective_markup_basis_points)
    select pricing_id,markup_rule_revision_id,3300 from tongs.private_pricing_revision_markup_sources where pricing_revision_id='18000000-0000-4000-8000-000000000003';
  if not found then raise exception 'canonical 33-percent markup source unavailable'; end if;
  insert into tongs.private_pricing_publications(id,policy_id,pricing_revision_id,publication_revision,action,reason,actor_id)
    values('19670000-0000-4000-8000-000000000006',policy_id,pricing_id,1,'published','One bounded normal-customer Test scope; Live remains inactive.',actor);

  select id into previous_catalog_id from tongs.openai_text_model_catalog_revisions where revision=14 and lifecycle_state='active';
  insert into tongs.openai_text_model_catalog_revisions(id,revision,lifecycle_state,quality_method,source_checked_at,content_hash,actor_id)
    values(catalog_id,15,'active','Revision 14 retained; add one-request two-output Timeline Image compatibility.','2026-09-24T00:00:00Z',
      encode(extensions.digest(convert_to('openai-model-catalog:15:timeline-image-gpt-image-2','utf8'),'sha256'),'hex'),actor);
  insert into tongs.openai_text_model_catalog_entries(id,catalog_revision_id,runtime_model_id,provider_model_id,display_name,tradeoff_summary,
    quality_rank,quality_basis,supported_apis,availability_status,availability_evidence,lifecycle_state,rate_revision_id)
  select extensions.uuid_generate_v5(catalog_id,'model:'||entry.provider_model_id),catalog_id,entry.runtime_model_id,entry.provider_model_id,
    entry.display_name,entry.tradeoff_summary,entry.quality_rank,entry.quality_basis,entry.supported_apis,entry.availability_status,
    case when entry.provider_model_id='gpt-image-2-2026-04-21' then entry.availability_evidence||jsonb_build_object('timeline_image_pricing_revision_id',pricing_id) else entry.availability_evidence end,
    entry.lifecycle_state,entry.rate_revision_id from tongs.openai_text_model_catalog_entries entry where entry.catalog_revision_id=previous_catalog_id;
  insert into tongs.openai_text_model_route_compatibility(id,catalog_entry_id,route_code,compatibility_status,maximum_input_tokens,maximum_output_tokens,
    maximum_attempts,supporting_cost_coverage,cost_policy_revision_id,evidence_json)
  select extensions.uuid_generate_v5(extensions.uuid_generate_v5(catalog_id,'model:'||old.provider_model_id),'route:'||compat.route_code),
    extensions.uuid_generate_v5(catalog_id,'model:'||old.provider_model_id),compat.route_code,compat.compatibility_status,compat.maximum_input_tokens,
    compat.maximum_output_tokens,compat.maximum_attempts,compat.supporting_cost_coverage,compat.cost_policy_revision_id,compat.evidence_json
  from tongs.openai_text_model_route_compatibility compat join tongs.openai_text_model_catalog_entries old on old.id=compat.catalog_entry_id
  where old.catalog_revision_id=previous_catalog_id;
  insert into tongs.openai_text_model_route_compatibility(id,catalog_entry_id,route_code,compatibility_status,maximum_input_tokens,maximum_output_tokens,
    maximum_attempts,supporting_cost_coverage,cost_policy_revision_id,evidence_json)
  select extensions.uuid_generate_v5(entry.id,'hearth.timeline_image_generation'),entry.id,'hearth.timeline_image_generation','generation_verified',16384,2,1,'complete',cost_id,
    jsonb_build_object('test_only',true,'endpoint','/v1/images/generations','size','1536x1024','quality','high','output_format','png','image_count',2,
      'reference_images',0,'fallback_providers',0,'provider_deadline_ms',180000,'attempt_lease_seconds',210,'outer_request_deadline_ms',240000,'pricing_revision_id',pricing_id)
  from tongs.openai_text_model_catalog_entries entry where entry.catalog_revision_id=catalog_id and entry.provider_model_id='gpt-image-2-2026-04-21';
  insert into tongs.openai_text_rollout_revisions(route_code,revision,mode,cost_policy_revision_id,reason,actor_id,funding_scope)
    values('hearth.timeline_image_generation',1,'enforce',cost_id,'Enable only the authorized Forge-funded Test customer scope; Live remains inactive.',actor,'forge');
end $$;

-- Extend the evolved shared financial functions without replacing their other behavior.
do $$ declare definition text; changed text; begin
  select pg_get_functiondef('tongs.create_customer_openai_text_quote(uuid,uuid,text,text,uuid,text,text,text,text,timestamptz)'::regprocedure) into definition;
  changed:=replace(definition,'p_route_code = ''hearth.thumbnail_base_generation''','p_route_code in (''hearth.thumbnail_base_generation'',''hearth.timeline_image_generation'')');
  changed:=replace(changed,'''hearth.thumbnail_base_generation'',''hearth.framing_pack_generation''','''hearth.thumbnail_base_generation'',''hearth.timeline_image_generation'',''hearth.framing_pack_generation''');
  if changed=definition or position('hearth.timeline_image_generation' in changed)=0 then raise exception 'quote route/SKU allow-list insertion point changed'; end if; execute changed;
  select pg_get_functiondef('tongs.persist_openai_text_paid_result(uuid,text,text,uuid,uuid,uuid,text,text,text,text,bigint,bigint,text,jsonb)'::regprocedure) into definition;
  changed:=replace(definition,'''hearth.thumbnail_base_generation'',''hearth.framing_pack_generation''','''hearth.thumbnail_base_generation'',''hearth.timeline_image_generation'',''hearth.framing_pack_generation''');
  if changed=definition or position('hearth.timeline_image_generation' in changed)=0 then raise exception 'result route allow-list insertion point changed'; end if; execute changed;
  select pg_get_functiondef('tongs.resolve_openai_text_model_for_quote(uuid,text,text)'::regprocedure) into definition;
  changed:=replace(definition,'x.route_code = ''hearth.thumbnail_base_generation''','x.route_code in (''hearth.thumbnail_base_generation'',''hearth.timeline_image_generation'')');
  if changed=definition then raise exception 'quote model image SKU insertion point changed'; end if; execute changed;
  select pg_get_functiondef('tongs.resolve_openai_text_model_for_funding_quote(uuid,uuid,text,text)'::regprocedure) into definition;
  changed:=replace(definition,'p_route_code = ''hearth.thumbnail_base_generation''','p_route_code in (''hearth.thumbnail_base_generation'',''hearth.timeline_image_generation'')');
  if changed=definition then raise exception 'funding quote image SKU insertion point changed'; end if; execute changed;
end $$;

insert into tongs.openai_text_failure_loss_policy_revisions(id,route_code,environment,revision,per_operation_limit_micros,aggregate_limit_micros,
  rolling_window_seconds,maximum_concurrency,lifecycle_state,reason,actor_id)
select row_value.id,'hearth.timeline_image_generation',row_value.environment,1,334900,row_value.aggregate_limit,86400,1,'active',row_value.reason,operator.user_id
from (values('19670000-0000-4000-8000-000000000009'::uuid,'test',334900::bigint,'One full-ceiling Test Timeline Image request.')) row_value(id,environment,aggregate_limit,reason)
cross join lateral(select user_id from tongs.platform_operators order by granted_at limit 1) operator;
insert into tongs.openai_text_failure_loss_rollout_revisions(route_code,financial_environment,revision,mode,loss_policy_revision_id,source_limit_event_id,reason,actor_id)
select 'hearth.timeline_image_generation',row_value.environment,1,'enforce',row_value.policy_id,null,row_value.reason,operator.user_id
from (values('test','19670000-0000-4000-8000-000000000009'::uuid,'Enforce one 334900-micro Test exposure.')) row_value(environment,policy_id,reason)
cross join lateral(select user_id from tongs.platform_operators order by granted_at limit 1) operator;

insert into tongs.customer_paid_execution_scope_authorizations(id,user_id,workspace_id,financial_environment,route_code,provider,model_or_sku,
 pricing_revision_id,cost_policy_revision_id,maximum_operation_count,maximum_customer_charge_micros,maximum_wholesale_exposure_micros,
 maximum_concurrency,rolling_window_seconds,valid_from,valid_until,status,reason,created_by,authorization_kind)
select extensions.uuid_generate_v5(base.id,'hearth.timeline_image_generation'),base.user_id,base.workspace_id,'test','hearth.timeline_image_generation','openai','gpt-image-2-2026-04-21',
 '19670000-0000-4000-8000-000000000005','19670000-0000-4000-8000-000000000001',null,450000,334900,1,null,now(),null,'active',
 'One bounded 90-credit Test Timeline Image operation; one n=2 request while Live remains inactive.',base.created_by,'normal_customer'
from tongs.customer_paid_execution_scope_authorizations base where base.financial_environment='test' and base.route_code='hearth.thumbnail_base_generation'
 and base.provider='openai' and base.status='active' and base.authorization_kind='normal_customer';

create table tongs.hearth_timeline_image_generation_results(
 id uuid primary key,operation_id text not null unique references tongs.openai_text_funding_bindings(operation_id) on delete restrict,
 reservation_id uuid not null unique references tongs.funding_reservations(id) on delete restrict,user_id uuid not null references auth.users(id) on delete restrict,
 workspace_id uuid not null references tongs.workspaces(id) on delete restrict,workpiece_id uuid not null references tongs.episodes(id) on delete restrict,
 image_moment_id text not null,request_fingerprint text not null check(request_fingerprint~'^[0-9a-f]{64}$'),provider_body_sha256 text not null check(provider_body_sha256~'^[0-9a-f]{64}$'),
 provider_request_id text,provider_response_id text,model text not null check(model='gpt-image-2-2026-04-21'),prompt_revision_id uuid not null references tongs.image_map_prompt_revisions(id) on delete restrict,
 prompt_content_hash text not null check(prompt_content_hash~'^[0-9a-f]{64}$'),semantic_authority_hash text not null check(semantic_authority_hash~'^[0-9a-f]{64}$'),
 image_count integer not null check(image_count=2),provider_attempt_count integer not null check(provider_attempt_count=1),supplier_cost_micros bigint not null check(supplier_cost_micros=334900),created_at timestamptz not null default now());
create table tongs.hearth_timeline_image_generation_outputs(
 result_id uuid not null references tongs.hearth_timeline_image_generation_results(id) on delete restrict,child_ordinal integer not null check(child_ordinal in(1,2)),
 bytes_base64 text not null check(length(bytes_base64)>0),content_hash text not null check(content_hash~'^[0-9a-f]{64}$'),mime_type text not null check(mime_type='image/png'),
 staged_asset_id uuid not null,staged_asset_path text not null,created_at timestamptz not null default now(),primary key(result_id,child_ordinal),unique(staged_asset_id));
create table tongs.hearth_timeline_image_generation_delivery_receipts(
 result_id uuid primary key references tongs.hearth_timeline_image_generation_results(id) on delete restrict,image_map_revision_id uuid not null references tongs.image_map_revisions(id) on delete restrict,
 asset_ids uuid[] not null check(cardinality(asset_ids)=2),delivered_at timestamptz not null default now());
alter table tongs.hearth_timeline_image_generation_results enable row level security; alter table tongs.hearth_timeline_image_generation_results force row level security;
alter table tongs.hearth_timeline_image_generation_outputs enable row level security; alter table tongs.hearth_timeline_image_generation_outputs force row level security;
alter table tongs.hearth_timeline_image_generation_delivery_receipts enable row level security; alter table tongs.hearth_timeline_image_generation_delivery_receipts force row level security;
revoke all on tongs.hearth_timeline_image_generation_results,tongs.hearth_timeline_image_generation_outputs,tongs.hearth_timeline_image_generation_delivery_receipts from public,anon,authenticated,service_role;
grant select on tongs.hearth_timeline_image_generation_results,tongs.hearth_timeline_image_generation_outputs,tongs.hearth_timeline_image_generation_delivery_receipts to service_role;
create trigger timeline_image_results_immutable before update or delete on tongs.hearth_timeline_image_generation_results for each row execute function tongs._reject_accounting_mutation();
create trigger timeline_image_outputs_immutable before update or delete on tongs.hearth_timeline_image_generation_outputs for each row execute function tongs._reject_accounting_mutation();
create trigger timeline_image_receipts_immutable before update or delete on tongs.hearth_timeline_image_generation_delivery_receipts for each row execute function tongs._reject_accounting_mutation();

create function tongs.stage_timeline_image_generation_result(p_operation_id text,p_request_fingerprint text,p_provider_body_sha256 text,
 p_provider_request_id text,p_provider_response_id text,p_prompt_revision_id uuid,p_prompt_content_hash text,p_semantic_authority_hash text,p_image_moment_id text,p_outputs jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare binding tongs.openai_text_funding_bindings%rowtype; reservation tongs.funding_reservations%rowtype; quote tongs.customer_spending_quotes%rowtype; quote_binding tongs.openai_text_customer_quote_bindings%rowtype; bounded tongs.bounded_provider_request_bindings%rowtype; result_id uuid:=extensions.uuid_generate_v5('19670000-0000-4000-8000-000000000011'::uuid,btrim(p_operation_id)); item jsonb; existing uuid;
begin
 perform tongs._require_pricing_service_role(); perform pg_advisory_xact_lock(hashtextextended('timeline-image-result:'||btrim(p_operation_id),0));
 select * into binding from tongs.openai_text_funding_bindings where operation_id=btrim(p_operation_id) and route_code='hearth.timeline_image_generation';
 select * into reservation from tongs.funding_reservations where id=binding.reservation_id;
 select * into quote from tongs.customer_spending_quotes where id=reservation.quote_id;
 select * into quote_binding from tongs.openai_text_customer_quote_bindings where quote_id=quote.id;
 select * into bounded from tongs.bounded_provider_request_bindings where reservation_id=reservation.id;
 select id into existing from tongs.hearth_timeline_image_generation_results where operation_id=btrim(p_operation_id);
 if existing is not null then return jsonb_build_object('result_id',existing,'replay',true); end if;
 if binding.reservation_id is null or binding.model<>'gpt-image-2-2026-04-21' or binding.maximum_output_units<>2 or binding.maximum_attempts<>1
  or quote_binding.request_fingerprint<>lower(p_request_fingerprint) or bounded.serialized_body_sha256<>lower(p_provider_body_sha256)
  or bounded.maximum_output_tokens<>2 or bounded.maximum_attempts<>1 or jsonb_typeof(p_outputs)<>'array' or jsonb_array_length(p_outputs)<>2
  or (select array_agg((value->>'child_ordinal')::int order by (value->>'child_ordinal')::int) from jsonb_array_elements(p_outputs))<>array[1,2]
 then raise exception 'invalid Timeline Image result evidence' using errcode='22023'; end if;
 insert into tongs.hearth_timeline_image_generation_results(id,operation_id,reservation_id,user_id,workspace_id,workpiece_id,image_moment_id,
  request_fingerprint,provider_body_sha256,provider_request_id,provider_response_id,model,prompt_revision_id,prompt_content_hash,semantic_authority_hash,image_count,provider_attempt_count,supplier_cost_micros)
 values(result_id,btrim(p_operation_id),reservation.id,reservation.user_id,quote_binding.workspace_id,quote_binding.workpiece_id::uuid,btrim(p_image_moment_id),lower(p_request_fingerprint),lower(p_provider_body_sha256),
  nullif(btrim(coalesce(p_provider_request_id,'')),''),nullif(btrim(coalesce(p_provider_response_id,'')),''),'gpt-image-2-2026-04-21',p_prompt_revision_id,lower(p_prompt_content_hash),lower(p_semantic_authority_hash),2,1,334900);
 for item in select * from jsonb_array_elements(p_outputs) loop
  insert into tongs.hearth_timeline_image_generation_outputs(result_id,child_ordinal,bytes_base64,content_hash,mime_type,staged_asset_id,staged_asset_path)
  values(result_id,(item->>'child_ordinal')::int,item->>'bytes_base64',encode(extensions.digest(decode(item->>'bytes_base64','base64'),'sha256'),'hex'),item->>'mime_type',(item->>'staged_asset_id')::uuid,
   'assets/image-map/candidates/'||quote_binding.workpiece_id||'/'||btrim(p_image_moment_id)||'/'||(item->>'staged_asset_id')||'-candidate-'||(item->>'child_ordinal')||'.png');
 end loop;
 return jsonb_build_object('result_id',result_id,'replay',false);
end $$;

create function tongs.read_staged_timeline_image_generation_result(p_operation_id text,p_request_fingerprint text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$ declare parent tongs.hearth_timeline_image_generation_results%rowtype; outputs jsonb; receipt jsonb;
begin perform tongs._require_pricing_service_role(); select * into parent from tongs.hearth_timeline_image_generation_results where operation_id=btrim(p_operation_id) and request_fingerprint=lower(p_request_fingerprint);
 if parent.id is null then return null; end if; select jsonb_agg(to_jsonb(child) order by child.child_ordinal) into outputs from tongs.hearth_timeline_image_generation_outputs child where child.result_id=parent.id;
 select to_jsonb(row_value) into receipt from tongs.hearth_timeline_image_generation_delivery_receipts row_value where row_value.result_id=parent.id;
 return to_jsonb(parent)||jsonb_build_object('outputs',outputs,'canonical_receipt',receipt); end $$;

create function tongs.finalize_timeline_image_generation_result(p_operation_id text,p_request_fingerprint text,p_image_map_revision_id uuid,p_asset_ids uuid[]) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$ declare parent tongs.hearth_timeline_image_generation_results%rowtype; existing tongs.hearth_timeline_image_generation_delivery_receipts%rowtype;
begin perform tongs._require_pricing_service_role(); perform pg_advisory_xact_lock(hashtextextended('timeline-image-finalize:'||btrim(p_operation_id),0));
 select * into parent from tongs.hearth_timeline_image_generation_results where operation_id=btrim(p_operation_id) and request_fingerprint=lower(p_request_fingerprint);
 if parent.id is null or cardinality(p_asset_ids)<>2 or (select count(*) from tongs.hearth_timeline_image_generation_outputs where result_id=parent.id and staged_asset_id=any(p_asset_ids))<>2
  or (select count(*) from tongs.assets where id=any(p_asset_ids) and status='ready')<>2 then raise exception 'Timeline Image canonical delivery is incomplete' using errcode='22023'; end if;
 select * into existing from tongs.hearth_timeline_image_generation_delivery_receipts where result_id=parent.id;
 if found then return to_jsonb(existing)||jsonb_build_object('replay',true); end if;
 insert into tongs.hearth_timeline_image_generation_delivery_receipts(result_id,image_map_revision_id,asset_ids) values(parent.id,p_image_map_revision_id,p_asset_ids) returning * into existing;
 return to_jsonb(existing)||jsonb_build_object('replay',false); end $$;
revoke all on function tongs.stage_timeline_image_generation_result(text,text,text,text,text,uuid,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function tongs.read_staged_timeline_image_generation_result(text,text) from public,anon,authenticated;
revoke all on function tongs.finalize_timeline_image_generation_result(text,text,uuid,uuid[]) from public,anon,authenticated;
grant execute on function tongs.stage_timeline_image_generation_result(text,text,text,text,text,uuid,text,text,text,jsonb) to service_role;
grant execute on function tongs.read_staged_timeline_image_generation_result(text,text) to service_role;
grant execute on function tongs.finalize_timeline_image_generation_result(text,text,uuid,uuid[]) to service_role;

create function tongs.read_timeline_image_generation_authority(p_user_id uuid,p_workspace_id uuid) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare risk jsonb; scope_count bigint; begin perform tongs._require_pricing_service_role();
 select to_jsonb(exposure) into risk from tongs._openai_text_failure_loss_exposure('hearth.timeline_image_generation','test',86400) exposure;
 select count(*) into scope_count from tongs.customer_paid_execution_scope_authorizations where user_id=p_user_id and workspace_id=p_workspace_id and route_code='hearth.timeline_image_generation' and financial_environment='test' and status='active';
 return jsonb_build_object('route_code','hearth.timeline_image_generation','provider','openai','model','gpt-image-2-2026-04-21','endpoint','/v1/images/generations',
  'image_count',2,'customer_price_credits',90,'supplier_ceiling_micros',334900,'supporting_cost_micros',0,'target_micros',445417,'rounding_adjustment_micros',4583,
  'maximum_attempts',1,'maximum_concurrency',1,'test_aggregate_micros',334900,'test_scope_count',scope_count,'risk',coalesce(risk,'{}'::jsonb),
  'live_active_scope_count',(select count(*) from tongs.customer_paid_execution_scope_authorizations where route_code='hearth.timeline_image_generation' and financial_environment='live' and status='active'),
  'live_aggregate_micros',coalesce((select aggregate_limit_micros from tongs.openai_text_failure_loss_policy_revisions where route_code='hearth.timeline_image_generation' and environment='live' order by revision desc limit 1),0)); end $$;
revoke all on function tongs.read_timeline_image_generation_authority(uuid,uuid) from public,anon,authenticated; grant execute on function tongs.read_timeline_image_generation_authority(uuid,uuid) to service_role;

do $$ begin
 if (select count(*) from tongs.customer_paid_execution_scope_authorizations where route_code='hearth.timeline_image_generation' and financial_environment='test' and status='active' and authorization_kind='normal_customer')<>1 then raise exception 'exactly one Test scope required'; end if;
 if exists(select 1 from tongs.customer_paid_execution_scope_authorizations where route_code='hearth.timeline_image_generation' and financial_environment='live' and status='active') then raise exception 'Live scope must remain zero'; end if;
 if not exists(select 1 from tongs.private_pricing_revisions where id='19670000-0000-4000-8000-000000000005' and customer_credit_units=90 and full_cost_ceiling_micros=334900 and unrounded_customer_price_micros=445417 and rounding_adjustment_micros=4583 and settled_customer_price_micros=450000) then raise exception 'Timeline Image economics mismatch'; end if;
 if has_table_privilege('authenticated','tongs.hearth_timeline_image_generation_results','select') or not has_table_privilege('service_role','tongs.hearth_timeline_image_generation_results','select') then raise exception 'Timeline Image evidence grants mismatch'; end if;
end $$;
notify pgrst,'reload schema';
commit;
