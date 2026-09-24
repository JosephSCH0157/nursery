-- One bounded Forge-funded Test narrative interpretation product. Historical
-- gpt-5-mini cost and halt revisions remain immutable evidence. Live stays inactive.
begin;

do $$
begin
  if not exists(select 1 from tongs.openai_text_provider_rate_revisions
    where id='56560000-0000-4000-8000-000000000001' and runtime_model_alias='gpt-5.6-luna'
      and input_micros_per_million_tokens=200000 and output_micros_per_million_tokens=1200000)
  then raise exception 'exact Luna rate revision is unavailable'; end if;
  if not exists(select 1 from tongs.openai_text_model_catalog_revisions where revision=13 and lifecycle_state='active')
  then raise exception 'active model catalog revision 13 is unavailable'; end if;
  if (select lifecycle_state from tongs.financial_environment_configuration_revisions
      where environment='live' order by revision desc limit 1)<>'inactive_ready'
  then raise exception 'Live must remain inactive-ready'; end if;
  if exists(select 1 from tongs.openai_text_rollout_revisions
      where route_code='visual.narrative_interpretation' and revision=2)
    and not exists(select 1 from tongs.openai_text_rollout_revisions
      where route_code='visual.narrative_interpretation' and revision=2 and mode='halt_new')
  then raise exception 'historical narrative rollout revision 2 is not halt_new'; end if;
end $$;

do $$
begin
  if not exists(select 1 from tongs.openai_text_route_policies
      where route_code='visual.narrative_interpretation' and maximum_attempts=1
        and requires_result_validation and requires_canonical_persistence)
  then raise exception 'historical visual narrative route policy is unavailable'; end if;
end $$;

insert into tongs.openai_text_cost_policy_revisions(
  id,route_code,revision,policy_code,attempt_plan,maximum_input_units,
  maximum_output_units,maximum_attempts,direct_provider_ceiling_micros,
  supporting_cost_ceiling_micros,full_cost_ceiling_micros,cost_coverage,lifecycle_state,notes
) values (
  '19000000-0000-4000-8000-000000000001','visual.narrative_interpretation',3,
  'openai-text:visual-narrative-interpretation:test-luna-v3',
  '[{"attempt":1,"rate_revision_id":"56560000-0000-4000-8000-000000000001","runtime_model":"gpt-5.6-luna","provider_model_id":"gpt-5.6-luna","input_max":4096,"output_max":1024}]',
  4096,1024,1,2049,0,2049,'complete','active',
  'Component-ceiling method: ceil(4096*0.20)=820 plus ceil(1024*1.20)=1229, totaling 2049 micros. Deterministic synthesis and persistence have zero attributable variable cost.'
);
insert into tongs.openai_text_supporting_cost_inventory(
  id,route_code,cost_policy_revision_id,component_code,disposition,evidence_status,notes
) values
  ('29000000-0000-4000-8000-000000000001','visual.narrative_interpretation','19000000-0000-4000-8000-000000000001','openai_visual_narrative_interpretation','attributable_metered','verified','One Luna Responses attempt is the only metered supplier cost.'),
  ('29000000-0000-4000-8000-000000000002','visual.narrative_interpretation','19000000-0000-4000-8000-000000000001','deterministic_synthesis_and_persistence','platform_overhead','verified','Local validation, deterministic synthesis, canonical persistence, and readback have no verified variable allocation.'),
  ('29000000-0000-4000-8000-000000000003','visual.narrative_interpretation','19000000-0000-4000-8000-000000000001','fixed_netlify_supabase_plans','platform_overhead','verified','Fixed hosting and database plans are not operation wholesale.');

do $$
declare
  actor uuid;
  policy_id constant uuid:='19000000-0000-4000-8000-000000000002';
  pricing_id constant uuid:='19000000-0000-4000-8000-000000000003';
  cost_id constant uuid:='19000000-0000-4000-8000-000000000001';
  catalog_id constant uuid:='19000000-0000-4000-8000-000000000005';
  previous_catalog_id uuid;
  sku constant text:='openai-text:visual.narrative_interpretation:gpt-5.6-luna:19000000-0000-4000-8000-000000000001';
begin
  select user_id into actor from tongs.platform_operators order by granted_at limit 1;
  if actor is null then raise exception 'platform operator required'; end if;
  insert into tongs.private_pricing_policies(id,policy_code,scope_kind,provider,sku,created_by)
  values(policy_id,'forge-visual-narrative-interpretation-test-luna-v1','sku','openai',sku,actor);
  insert into tongs.private_pricing_revisions(
    id,policy_id,revision,previous_revision_id,lifecycle_state,currency,markup_basis_points,
    full_cost_ceiling_micros,failure_cost_ceiling_micros,customer_price_ceiling_micros,
    billable_failure_ceiling_micros,customer_credit_units,billable_failure_classes,
    free_failure_classes,included_quantity,retention_policy,change_reason,content_hash,actor_id,
    unrounded_customer_price_micros,rounding_adjustment_micros,settled_customer_price_micros
  ) values (
    pricing_id,policy_id,1,null,'review_ready','USD',3300,2049,0,5000,0,1,'[]',
    '["pre_provider_rejection","provider_failure","forge_failure","validation_failure","persistence_failure"]',
    '{"input_tokens":4096,"output_tokens":1024,"provider_attempts":1,"browsing_requests":0,"retrieval_requests":0,"tools":0,"attachments":0}',
    '{"canonical_prompt":"platform_overhead","validation_evidence":"restricted_immutable","result_recovery":"restricted_immutable"}',
    'Approved one-credit Test narrative interpretation product. Component-ceiling full cost is 2049 micros; 33-percent target is 2726 micros and settles on the 5000-micro Forge Credit grid.',
    encode(extensions.digest(convert_to('forge-visual-narrative-test-v1:2049:2726:2274:5000:1','utf8'),'sha256'),'hex'),
    actor,2726,2274,5000
  );
  insert into tongs.private_pricing_cost_components(
    pricing_revision_id,ordinal,component_code,component_kind,credential_funding,provider_label,
    success_ceiling_micros,failure_ceiling_micros,cost_policy_revision,tail_policy,tail_policy_details
  ) values
    (pricing_id,1,'openai_visual_narrative_interpretation','direct_provider','forge','OpenAI',2049,0,'Luna rate revision 56560000-0000-4000-8000-000000000001','none','{"input_ceiling_micros":820,"output_ceiling_micros":1229}'),
    (pricing_id,2,'verified_variable_supporting_cost','compute','forge','Forge',0,0,'Direct-only approved basis 2026-09-24','none','{"verified_attributable_variable_micros":0}'),
    (pricing_id,3,'fixed_platform_and_evidence_retention','retention_tail','forge','Forge platform',0,0,'Supporting-cost policy 2026-09-24','plan_funded','{"classification":"platform_overhead","operation_allocation_micros":0}');
  insert into tongs.private_pricing_revision_markup_sources(pricing_revision_id,markup_rule_revision_id,effective_markup_basis_points)
  select pricing_id,markup_rule_revision_id,3300 from tongs.private_pricing_revision_markup_sources
  where pricing_revision_id='18000000-0000-4000-8000-000000000003';
  if not found then raise exception 'canonical 33-percent markup source unavailable'; end if;
  insert into tongs.private_pricing_publications(id,policy_id,pricing_revision_id,publication_revision,action,reason,actor_id)
  values('19000000-0000-4000-8000-000000000004',policy_id,pricing_id,1,'published','Publish only for one bounded Test customer scope; Live remains inactive.',actor);

  select id into previous_catalog_id from tongs.openai_text_model_catalog_revisions
  where revision=13 and lifecycle_state='active' limit 1;
  insert into tongs.openai_text_model_catalog_revisions(id,revision,lifecycle_state,quality_method,source_checked_at,content_hash,actor_id)
  values(catalog_id,14,'active','Revision 13 retained; Luna gains bounded strict-schema visual narrative interpretation compatibility.',
    '2026-09-24T00:00:00Z',encode(extensions.digest(convert_to('openai-model-catalog:14:visual-narrative-luna','utf8'),'sha256'),'hex'),actor);
  insert into tongs.openai_text_model_catalog_entries(
    id,catalog_revision_id,runtime_model_id,provider_model_id,display_name,tradeoff_summary,
    quality_rank,quality_basis,supported_apis,availability_status,availability_evidence,lifecycle_state,rate_revision_id
  ) select extensions.uuid_generate_v5(catalog_id,'model:'||entry.provider_model_id),catalog_id,
    entry.runtime_model_id,entry.provider_model_id,entry.display_name,entry.tradeoff_summary,
    entry.quality_rank,entry.quality_basis,entry.supported_apis,entry.availability_status,
    case when entry.provider_model_id='gpt-5.6-luna' then entry.availability_evidence||jsonb_build_object(
      'visual_narrative_test_cost_policy_revision_id',cost_id,'visual_narrative_test_pricing_revision_id',pricing_id)
      else entry.availability_evidence end,entry.lifecycle_state,entry.rate_revision_id
  from tongs.openai_text_model_catalog_entries entry where entry.catalog_revision_id=previous_catalog_id;
  insert into tongs.openai_text_model_route_compatibility(
    id,catalog_entry_id,route_code,compatibility_status,maximum_input_tokens,maximum_output_tokens,
    maximum_attempts,supporting_cost_coverage,cost_policy_revision_id,evidence_json
  ) select extensions.uuid_generate_v5(extensions.uuid_generate_v5(catalog_id,'model:'||old.provider_model_id),'route:'||compat.route_code),
    extensions.uuid_generate_v5(catalog_id,'model:'||old.provider_model_id),compat.route_code,compat.compatibility_status,
    compat.maximum_input_tokens,compat.maximum_output_tokens,compat.maximum_attempts,
    compat.supporting_cost_coverage,compat.cost_policy_revision_id,compat.evidence_json
  from tongs.openai_text_model_route_compatibility compat
  join tongs.openai_text_model_catalog_entries old on old.id=compat.catalog_entry_id
  where old.catalog_revision_id=previous_catalog_id
    and not(old.provider_model_id='gpt-5.6-luna' and compat.route_code='visual.narrative_interpretation');
  insert into tongs.openai_text_model_route_compatibility(
    id,catalog_entry_id,route_code,compatibility_status,maximum_input_tokens,maximum_output_tokens,
    maximum_attempts,supporting_cost_coverage,cost_policy_revision_id,evidence_json
  ) select extensions.uuid_generate_v5(entry.id,'visual.narrative_interpretation'),entry.id,
    'visual.narrative_interpretation','generation_verified',4096,1024,1,'complete',cost_id,
    jsonb_build_object('test_only',true,'api','responses','strict_json_schema',true,'response_byte_ceiling',16384,
      'browsing_requests',0,'retrieval_requests',0,'tools',0,'attachments',0,'fallback_models',0,
      'interpretation_contract','forge.image-prompt-interpretation.v2','validator_contract','forge.image-prompt-validator.v2',
      'synthesis_contract','forge.image-prompt-synthesis.v3','pricing_revision_id',pricing_id)
  from tongs.openai_text_model_catalog_entries entry
  where entry.catalog_revision_id=catalog_id and entry.provider_model_id='gpt-5.6-luna';
  insert into tongs.openai_text_rollout_revisions(route_code,revision,mode,cost_policy_revision_id,reason,actor_id,funding_scope)
  values('visual.narrative_interpretation',3,'enforce',cost_id,'Replace the historical halt only for the bounded Forge-funded Test customer scope; Live remains inactive.',actor,'forge');
end $$;

insert into tongs.openai_text_failure_loss_policy_revisions(
  id,route_code,environment,revision,per_operation_limit_micros,aggregate_limit_micros,
  rolling_window_seconds,maximum_concurrency,lifecycle_state,reason,actor_id
) select row_value.id,'visual.narrative_interpretation',row_value.environment,1,2049,2049,86400,1,'active',row_value.reason,operator.user_id
from (values
  ('19000000-0000-4000-8000-000000000006'::uuid,'test','One full-ceiling Test narrative interpretation canary; exactly one provider attempt.'),
  ('19000000-0000-4000-8000-000000000007'::uuid,'live','Defensive parity policy only; no Live customer scope or activation.')
) row_value(id,environment,reason)
cross join lateral(select user_id from tongs.platform_operators order by granted_at limit 1) operator;
insert into tongs.openai_text_failure_loss_rollout_revisions(
  route_code,financial_environment,revision,mode,loss_policy_revision_id,source_limit_event_id,reason,actor_id
) select 'visual.narrative_interpretation',row_value.environment,1,'enforce',row_value.policy_id,null,row_value.reason,operator.user_id
from (values
  ('test','19000000-0000-4000-8000-000000000006'::uuid,'Enforce one 2049-micro Test narrative exposure.'),
  ('live','19000000-0000-4000-8000-000000000007'::uuid,'No Live narrative execution scope exists.')
) row_value(environment,policy_id,reason)
cross join lateral(select user_id from tongs.platform_operators order by granted_at limit 1) operator;

insert into tongs.customer_paid_execution_scope_authorizations(
  id,user_id,workspace_id,financial_environment,route_code,provider,model_or_sku,
  pricing_revision_id,cost_policy_revision_id,maximum_operation_count,maximum_customer_charge_micros,
  maximum_wholesale_exposure_micros,maximum_concurrency,rolling_window_seconds,valid_from,valid_until,
  status,reason,created_by,authorization_kind
) select extensions.uuid_generate_v5(base.id,'visual.narrative_interpretation'),base.user_id,base.workspace_id,
  'test','visual.narrative_interpretation','openai','gpt-5.6-luna',
  '19000000-0000-4000-8000-000000000003','19000000-0000-4000-8000-000000000001',
  null,5000,2049,1,null,now(),null,'active',
  'Approved one-credit bounded Test narrative interpretation canary; one operation while Live remains inactive.',
  base.created_by,'normal_customer'
from tongs.customer_paid_execution_scope_authorizations base
where base.financial_environment='test' and base.route_code='hearth.thumbnail_base_generation'
  and base.provider='openai' and base.status='active' and base.authorization_kind='normal_customer';

create or replace function tongs.validate_image_map_visual_brief(p_brief jsonb) returns text[]
language plpgsql immutable strict set search_path=pg_catalog as $$
declare invalid text[]:=array[]::text[]; key text; value jsonb; item jsonb;
begin
  if jsonb_typeof(p_brief)<>'object' or octet_length(p_brief::text)>16384 then return array['response']; end if;
  foreach key in array array['narrative_purpose','central_message','relationship_or_action','emotional_tone','setting','composition'] loop
    value:=p_brief->key;
    if jsonb_typeof(value)<>'string' or length(btrim(value#>>'{}'))=0
      or (value#>>'{}')~*'(supporting the stated narrative idea|contextually accurate environment|clear editorial hierarchy|visual evidence of (the idea|supporting)|clear, grounded,? and documentary|appropriate context|make the relationship clear|offer alternate angles|create multiple interpretations)'
    then invalid:=array_append(invalid,key); end if;
  end loop;
  foreach key in array array['primary_subjects','essential_visual_evidence','avoid'] loop
    value:=p_brief->key;
    if jsonb_typeof(value)<>'array' or jsonb_array_length(value)<1
      or (key='primary_subjects' and jsonb_array_length(value)>4)
      or (key<>'primary_subjects' and jsonb_array_length(value)>5)
    then invalid:=array_append(invalid,key); continue; end if;
    for item in select * from jsonb_array_elements(value) loop
      if jsonb_typeof(item)<>'string' or length(btrim(item#>>'{}'))=0
        or (item#>>'{}')~*'(supporting the stated narrative idea|contextually accurate environment|clear editorial hierarchy|visual evidence of (the idea|supporting)|appropriate context|offer alternate angles|create multiple interpretations)'
      then invalid:=array_append(invalid,key); exit; end if;
    end loop;
  end loop;
  if p_brief->>'visual_mode' not in('literal','documentary','editorial','metaphorical','historical_reconstruction','diagrammatic')
  then invalid:=array_append(invalid,'visual_mode'); end if;
  if jsonb_typeof(p_brief->'source_context')<>'object' or jsonb_typeof(p_brief#>'{source_context,focus}')<>'string'
    or length(btrim(p_brief#>>'{source_context,focus}'))=0
  then invalid:=array_append(invalid,'source_context'); end if;
  return(select coalesce(array_agg(distinct field),array[]::text[]) from unnest(invalid) field);
end $$;

create or replace function tongs.preflight_image_prompt_interpretation(
  p_workspace_id uuid,p_workpiece_id uuid,p_image_moment_id text,p_image_map_revision_id uuid,
  p_script_approval_id uuid,p_expected_prompt_revision_id uuid,p_expected_prompt_revision bigint,
  p_creator_direction text,p_visual_style text
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare map_seq tongs.workpiece_image_map_sequences%rowtype; map_row tongs.image_map_revisions%rowtype;
  script_seq tongs.workpiece_script_approval_sequences%rowtype; prompt_seq tongs.image_map_prompt_sequences%rowtype; moment jsonb;
begin
  if not tongs.has_workspace_role(p_workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501'; end if;
  select * into map_seq from tongs.workpiece_image_map_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
  if map_seq.current_revision_id is distinct from p_image_map_revision_id then return jsonb_build_object('disposition','image_map_revision_conflict'); end if;
  select * into map_row from tongs.image_map_revisions where id=map_seq.current_revision_id;
  select * into script_seq from tongs.workpiece_script_approval_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
  if map_row.id is null or map_row.provenance_state<>'current' or map_row.source_script_approval_id is distinct from p_script_approval_id
    or script_seq.current_approval_id is distinct from p_script_approval_id
    or script_seq.current_revision is distinct from map_row.source_script_approval_revision
  then return jsonb_build_object('disposition','script_revision_conflict'); end if;
  select entry into moment from jsonb_array_elements(coalesce(map_row.document_json->'entries','[]'::jsonb)) entry where entry->>'id'=p_image_moment_id;
  if moment is null then return jsonb_build_object('disposition','image_moment_not_found'); end if;
  if moment->>'description' is distinct from btrim(p_creator_direction)
    or moment->>'style_preset' is distinct from nullif(btrim(coalesce(p_visual_style,'')),'')
  then return jsonb_build_object('disposition','image_moment_identity_conflict'); end if;
  select * into prompt_seq from tongs.image_map_prompt_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and image_moment_id=p_image_moment_id;
  if coalesce(prompt_seq.current_prompt_revision,0)<>p_expected_prompt_revision
    or prompt_seq.current_prompt_revision_id is distinct from p_expected_prompt_revision_id
  then return jsonb_build_object('disposition','prompt_revision_conflict'); end if;
  if to_regprocedure('tongs.commit_image_prompt_interpretation(text,text,jsonb,text,text,text,text,text,text,jsonb,uuid)') is null
    or to_regprocedure('tongs.read_current_image_prompt(uuid,uuid,text)') is null
  then return jsonb_build_object('disposition','persistence_authority_missing'); end if;
  return jsonb_build_object('disposition','ready','image_map_revision',map_row.revision,
    'script_approval_revision',map_row.source_script_approval_revision,'expected_prompt_revision',p_expected_prompt_revision,
    'creator_direction',moment->>'description','visual_style',moment->>'style_preset');
end $$;
revoke all on function tongs.preflight_image_prompt_interpretation(uuid,uuid,text,uuid,uuid,uuid,bigint,text,text) from public,anon;
grant execute on function tongs.preflight_image_prompt_interpretation(uuid,uuid,text,uuid,uuid,uuid,bigint,text,text) to authenticated,service_role;

create table tongs.visual_narrative_interpretation_results(
  id uuid primary key,
  operation_id text not null unique references tongs.openai_text_funding_bindings(operation_id) on delete restrict,
  reservation_id uuid not null unique references tongs.funding_reservations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
  workpiece_id uuid not null,
  request_fingerprint text not null check(request_fingerprint~'^[0-9a-f]{64}$'),
  provider_body_sha256 text not null check(provider_body_sha256~'^[0-9a-f]{64}$'),
  provider_request_id text,model text not null check(model='gpt-5.6-luna'),
  input_units bigint not null check(input_units between 0 and 4096),
  output_units bigint not null check(output_units between 0 and 1024),
  visual_brief_json jsonb not null check(jsonb_typeof(visual_brief_json)='object'),
  contracts_json jsonb not null check(jsonb_typeof(contracts_json)='object'),
  image_map_revision_id uuid not null,image_map_revision bigint not null check(image_map_revision>0),
  script_approval_id uuid not null,script_approval_revision bigint not null check(script_approval_revision>0),
  creator_direction text not null check(length(btrim(creator_direction))>0),visual_style text,
  synthesized_prompt text not null check(length(btrim(synthesized_prompt))>0),created_at timestamptz not null default now(),
  foreign key(workpiece_id,workspace_id) references tongs.episodes(id,workspace_id) on delete restrict,
  foreign key(image_map_revision_id,workspace_id,workpiece_id,image_map_revision) references tongs.image_map_revisions(id,workspace_id,workpiece_id,revision),
  foreign key(script_approval_id,workspace_id,workpiece_id,script_approval_revision) references tongs.script_approval_revisions(id,workspace_id,workpiece_id,approval_revision)
);
create table tongs.visual_narrative_interpretation_canonical_receipts(
  result_id uuid primary key references tongs.visual_narrative_interpretation_results(id) on delete restrict,
  canonical_prompt_revision_id uuid not null references tongs.image_map_prompt_revisions(id) on delete restrict,
  canonical_content_hash text not null check(canonical_content_hash~'^[0-9a-f]{64}$'),committed_at timestamptz not null default now()
);
alter table tongs.visual_narrative_interpretation_results enable row level security;
alter table tongs.visual_narrative_interpretation_results force row level security;
alter table tongs.visual_narrative_interpretation_canonical_receipts enable row level security;
alter table tongs.visual_narrative_interpretation_canonical_receipts force row level security;
revoke all on tongs.visual_narrative_interpretation_results,tongs.visual_narrative_interpretation_canonical_receipts from public,anon,authenticated,service_role;
grant select on tongs.visual_narrative_interpretation_results,tongs.visual_narrative_interpretation_canonical_receipts to service_role;
create trigger visual_narrative_results_immutable before update or delete on tongs.visual_narrative_interpretation_results for each row execute function tongs._reject_accounting_mutation();
create trigger visual_narrative_receipts_immutable before update or delete on tongs.visual_narrative_interpretation_canonical_receipts for each row execute function tongs._reject_accounting_mutation();

create function tongs.stage_visual_narrative_interpretation_result(
  p_operation_id text,p_request_fingerprint text,p_provider_body_sha256 text,p_provider_request_id text,
  p_input_units bigint,p_output_units bigint,p_visual_brief_json jsonb,p_contracts_json jsonb,
  p_image_map_revision_id uuid,p_image_map_revision bigint,p_script_approval_id uuid,p_script_approval_revision bigint,
  p_creator_direction text,p_visual_style text,p_synthesized_prompt text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare binding tongs.openai_text_funding_bindings%rowtype; reservation tongs.funding_reservations%rowtype;
  quote tongs.customer_spending_quotes%rowtype; bounded tongs.bounded_provider_request_bindings%rowtype;
  map_row tongs.image_map_revisions%rowtype; existing tongs.visual_narrative_interpretation_results%rowtype;
  result_id uuid:=extensions.uuid_generate_v5('19000000-0000-4000-8000-000000000008'::uuid,btrim(p_operation_id));
begin
  perform tongs._require_pricing_service_role();
  perform pg_advisory_xact_lock(hashtextextended('visual-narrative-result:'||btrim(p_operation_id),0));
  select * into binding from tongs.openai_text_funding_bindings where operation_id=btrim(p_operation_id) and route_code='visual.narrative_interpretation';
  select * into reservation from tongs.funding_reservations where id=binding.reservation_id;
  select * into quote from tongs.customer_spending_quotes where id=reservation.quote_id;
  select * into bounded from tongs.bounded_provider_request_bindings where reservation_id=reservation.id;
  select * into map_row from tongs.image_map_revisions where id=p_image_map_revision_id;
  if binding.reservation_id is null or binding.model<>'gpt-5.6-luna' or binding.maximum_input_units<>4096
    or binding.maximum_output_units<>1024 or binding.maximum_attempts<>1
    or quote.request_fingerprint<>lower(p_request_fingerprint) or bounded.serialized_body_sha256<>lower(p_provider_body_sha256)
    or bounded.serialized_bytes<=0 or bounded.maximum_output_tokens<>1024 or bounded.maximum_attempts<>1
    or cardinality(tongs.validate_image_map_visual_brief(p_visual_brief_json))>0
    or p_contracts_json<>jsonb_build_object('interpretation','forge.image-prompt-interpretation.v2','validator','forge.image-prompt-validator.v2','synthesis','forge.image-prompt-synthesis.v3')
    or map_row.id is null or map_row.revision<>p_image_map_revision or map_row.source_script_approval_id<>p_script_approval_id
    or map_row.source_script_approval_revision<>p_script_approval_revision
    or p_input_units not between 0 and 4096 or p_output_units not between 0 and 1024
    or length(btrim(coalesce(p_creator_direction,'')))=0 or length(btrim(coalesce(p_synthesized_prompt,'')))=0
  then raise exception 'invalid visual narrative result evidence' using errcode='22023'; end if;
  select * into existing from tongs.visual_narrative_interpretation_results where operation_id=btrim(p_operation_id);
  if found then
    if existing.request_fingerprint<>lower(p_request_fingerprint) or existing.provider_body_sha256<>lower(p_provider_body_sha256)
      or existing.visual_brief_json<>p_visual_brief_json or existing.synthesized_prompt<>p_synthesized_prompt
    then raise exception 'visual narrative result replay conflict' using errcode='23505'; end if;
    return to_jsonb(existing)||jsonb_build_object('replay',true);
  end if;
  insert into tongs.visual_narrative_interpretation_results(
    id,operation_id,reservation_id,user_id,workspace_id,workpiece_id,request_fingerprint,provider_body_sha256,
    provider_request_id,model,input_units,output_units,visual_brief_json,contracts_json,image_map_revision_id,
    image_map_revision,script_approval_id,script_approval_revision,creator_direction,visual_style,synthesized_prompt
  ) values(result_id,btrim(p_operation_id),reservation.id,reservation.user_id,map_row.workspace_id,map_row.workpiece_id,
    lower(p_request_fingerprint),lower(p_provider_body_sha256),nullif(btrim(coalesce(p_provider_request_id,'')),''),
    'gpt-5.6-luna',p_input_units,p_output_units,p_visual_brief_json,p_contracts_json,map_row.id,map_row.revision,
    p_script_approval_id,p_script_approval_revision,btrim(p_creator_direction),nullif(btrim(coalesce(p_visual_style,'')),''),p_synthesized_prompt);
  return jsonb_build_object('result_id',result_id,'replay',false);
end $$;

create function tongs.read_staged_visual_narrative_interpretation_result(p_operation_id text,p_request_fingerprint text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare result_row tongs.visual_narrative_interpretation_results%rowtype; receipt tongs.visual_narrative_interpretation_canonical_receipts%rowtype;
begin
  perform tongs._require_pricing_service_role();
  select * into result_row from tongs.visual_narrative_interpretation_results
  where operation_id=btrim(p_operation_id) and request_fingerprint=lower(p_request_fingerprint);
  if result_row.id is null then return null; end if;
  select * into receipt from tongs.visual_narrative_interpretation_canonical_receipts where result_id=result_row.id;
  return to_jsonb(result_row)||jsonb_build_object('canonical_receipt',case when receipt.result_id is null then null else to_jsonb(receipt) end);
end $$;

create function tongs.finalize_visual_narrative_interpretation_result(
  p_operation_id text,p_request_fingerprint text,p_canonical_prompt_revision_id uuid,p_canonical_content_hash text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare result_row tongs.visual_narrative_interpretation_results%rowtype; revision_row tongs.image_map_prompt_revisions%rowtype;
  receipt tongs.visual_narrative_interpretation_canonical_receipts%rowtype;
begin
  perform tongs._require_pricing_service_role();
  perform pg_advisory_xact_lock(hashtextextended('visual-narrative-finalize:'||btrim(p_operation_id),0));
  select * into result_row from tongs.visual_narrative_interpretation_results
  where operation_id=btrim(p_operation_id) and request_fingerprint=lower(p_request_fingerprint);
  select * into revision_row from tongs.image_map_prompt_revisions where id=p_canonical_prompt_revision_id;
  if result_row.id is null or revision_row.id is null or revision_row.content_hash<>lower(p_canonical_content_hash)
    or revision_row.image_moment_id is distinct from (select image_moment_id from tongs.image_map_prompt_operation_receipts where operation_id=result_row.operation_id)
    or revision_row.image_map_revision_id<>result_row.image_map_revision_id or revision_row.script_approval_id<>result_row.script_approval_id
    or revision_row.validator_version<>'forge.image-prompt-validator.v2' or revision_row.prompt_source<>'ai_derived'
  then raise exception 'invalid canonical visual narrative receipt' using errcode='22023'; end if;
  select * into receipt from tongs.visual_narrative_interpretation_canonical_receipts where result_id=result_row.id;
  if found then
    if receipt.canonical_prompt_revision_id<>revision_row.id or receipt.canonical_content_hash<>revision_row.content_hash
    then raise exception 'visual narrative canonical replay conflict' using errcode='23505'; end if;
    return to_jsonb(receipt)||jsonb_build_object('replay',true);
  end if;
  insert into tongs.visual_narrative_interpretation_canonical_receipts(result_id,canonical_prompt_revision_id,canonical_content_hash)
  values(result_row.id,revision_row.id,revision_row.content_hash) returning * into receipt;
  return to_jsonb(receipt)||jsonb_build_object('replay',false);
end $$;
revoke all on function tongs.stage_visual_narrative_interpretation_result(text,text,text,text,bigint,bigint,jsonb,jsonb,uuid,bigint,uuid,bigint,text,text,text) from public,anon,authenticated;
revoke all on function tongs.read_staged_visual_narrative_interpretation_result(text,text) from public,anon,authenticated;
revoke all on function tongs.finalize_visual_narrative_interpretation_result(text,text,uuid,text) from public,anon,authenticated;
grant execute on function tongs.stage_visual_narrative_interpretation_result(text,text,text,text,bigint,bigint,jsonb,jsonb,uuid,bigint,uuid,bigint,text,text,text) to service_role;
grant execute on function tongs.read_staged_visual_narrative_interpretation_result(text,text) to service_role;
grant execute on function tongs.finalize_visual_narrative_interpretation_result(text,text,uuid,text) to service_role;

create or replace function tongs.record_openai_text_validation_failure_evidence(
  p_route_code text,p_operation_id text,p_reservation_id uuid,p_provider_request_id text,
  p_model text,p_input_units bigint,p_output_units bigint,p_raw_provider_response_text text,
  p_validation_error_code text,p_validation_contract_revision text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare binding tongs.openai_text_funding_bindings%rowtype; capture tongs.openai_text_provider_captures%rowtype;
  existing tongs.openai_text_validation_failure_evidence%rowtype;
  evidence_id uuid:=extensions.uuid_generate_v5(p_reservation_id,'openai-text-validation-failure-v1');
begin
  perform tongs._require_pricing_service_role();
  perform pg_advisory_xact_lock(hashtextextended('openai-text-validation-failure:'||p_reservation_id::text,0));
  select * into binding from tongs.openai_text_funding_bindings where operation_id=btrim(p_operation_id) and reservation_id=p_reservation_id and route_code=p_route_code;
  select * into capture from tongs.openai_text_provider_captures where reservation_id=p_reservation_id and attempt_number=1;
  if p_route_code not in('hearth.framing_pack_generation','visual.unified_plan','hearth.thumbnail_direction_generation','visual.narrative_interpretation')
    or binding.reservation_id is null or binding.model<>'gpt-5.6-luna' or binding.maximum_attempts<>1 or capture.id is null
    or capture.provider_request_id is distinct from nullif(btrim(coalesce(p_provider_request_id,'')),'')
    or capture.input_units is distinct from p_input_units or capture.output_units is distinct from p_output_units
    or capture.response_evidence_json->>'raw_provider_response_text' is distinct from p_raw_provider_response_text or p_model is distinct from binding.model
    or (p_route_code='hearth.framing_pack_generation' and p_validation_contract_revision is distinct from 'framing_pack_seven_sections.v1')
    or (p_route_code='visual.unified_plan' and p_validation_contract_revision not in('forge.unified-visual-plan-provider.v4','forge.unified-visual-plan-provider.v5'))
    or (p_route_code='hearth.thumbnail_direction_generation' and p_validation_contract_revision is distinct from 'thumbnail_directions_three.v1')
    or (p_route_code='visual.narrative_interpretation' and (p_validation_contract_revision is distinct from 'forge.image-prompt-validator.v2' or octet_length(coalesce(p_raw_provider_response_text,''))>16384))
    or p_validation_error_code!~'^[a-z][a-z0-9_]{2,100}$' or octet_length(coalesce(p_raw_provider_response_text,'')) not between 1 and 65536
  then raise exception 'invalid OpenAI text validation evidence' using errcode='22023'; end if;
  select * into existing from tongs.openai_text_validation_failure_evidence where reservation_id=p_reservation_id or operation_id=btrim(p_operation_id);
  if found then
    if existing.route_code is distinct from p_route_code or existing.provider_capture_id is distinct from capture.id
      or existing.raw_provider_response_text is distinct from p_raw_provider_response_text
      or existing.validation_error_code is distinct from p_validation_error_code
      or existing.validation_contract_revision is distinct from p_validation_contract_revision
    then raise exception 'OpenAI text validation evidence replay conflict' using errcode='23505'; end if;
    return jsonb_build_object('evidence_id',existing.id,'replay',true);
  end if;
  insert into tongs.openai_text_validation_failure_evidence(
    id,route_code,operation_id,reservation_id,provider_capture_id,provider_request_id,model,input_units,output_units,
    raw_provider_response_text,validation_error_code,validation_contract_revision
  ) values(evidence_id,p_route_code,btrim(p_operation_id),p_reservation_id,capture.id,capture.provider_request_id,p_model,
    p_input_units,p_output_units,p_raw_provider_response_text,p_validation_error_code,p_validation_contract_revision);
  return jsonb_build_object('evidence_id',evidence_id,'replay',false);
end $$;
revoke all on function tongs.record_openai_text_validation_failure_evidence(text,text,uuid,text,text,bigint,bigint,text,text,text) from public,anon,authenticated;
grant execute on function tongs.record_openai_text_validation_failure_evidence(text,text,uuid,text,text,bigint,bigint,text,text,text) to service_role;

create function tongs.read_visual_narrative_interpretation_authority(p_user_id uuid,p_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare scope_row tongs.customer_paid_execution_scope_authorizations%rowtype; risk jsonb;
begin
  perform tongs._require_pricing_service_role();
  select * into scope_row from tongs.customer_paid_execution_scope_authorizations
  where user_id=p_user_id and workspace_id=p_workspace_id and route_code='visual.narrative_interpretation'
    and financial_environment='test' and status='active' and valid_from<=now() and(valid_until is null or valid_until>now())
  order by created_at desc limit 1;
  select to_jsonb(exposure) into risk from tongs._openai_text_failure_loss_exposure('visual.narrative_interpretation','test',86400) exposure;
  return jsonb_build_object('route_code','visual.narrative_interpretation','provider','openai','model','gpt-5.6-luna',
    'customer_price_credits',1,'supplier_ceiling_micros',2049,'supporting_cost_micros',0,'target_micros',2726,
    'maximum_input_tokens',4096,'maximum_output_tokens',1024,'maximum_response_bytes',16384,'maximum_attempts',1,
    'scope',case when scope_row.id is null then null else to_jsonb(scope_row) end,'risk',coalesce(risk,'{}'::jsonb),
    'live_active_scope_count',(select count(*) from tongs.customer_paid_execution_scope_authorizations
      where route_code='visual.narrative_interpretation' and financial_environment='live' and status='active'));
end $$;
revoke all on function tongs.read_visual_narrative_interpretation_authority(uuid,uuid) from public,anon,authenticated;
grant execute on function tongs.read_visual_narrative_interpretation_authority(uuid,uuid) to service_role;

do $$
begin
  if (select count(*) from tongs.customer_paid_execution_scope_authorizations
      where route_code='visual.narrative_interpretation' and financial_environment='test' and authorization_kind='normal_customer' and status='active')<>1
  then raise exception 'exactly one Test narrative interpretation scope is required'; end if;
  if exists(select 1 from tongs.customer_paid_execution_scope_authorizations
      where route_code='visual.narrative_interpretation' and financial_environment='live' and status='active')
  then raise exception 'Live narrative interpretation scope must remain absent'; end if;
  if not exists(select 1 from tongs.private_pricing_revisions where id='19000000-0000-4000-8000-000000000003'
      and customer_credit_units=1 and full_cost_ceiling_micros=2049 and unrounded_customer_price_micros=2726 and settled_customer_price_micros=5000)
  then raise exception 'narrative interpretation economics mismatch'; end if;
  if not exists(select 1 from tongs.openai_text_model_catalog_revisions catalog
      join tongs.openai_text_model_catalog_entries entry on entry.catalog_revision_id=catalog.id
      join tongs.openai_text_model_route_compatibility compat on compat.catalog_entry_id=entry.id
      where catalog.revision=14 and catalog.lifecycle_state='active' and entry.provider_model_id='gpt-5.6-luna'
        and compat.route_code='visual.narrative_interpretation' and compat.compatibility_status='generation_verified'
        and compat.maximum_input_tokens=4096 and compat.maximum_output_tokens=1024 and compat.maximum_attempts=1
        and compat.cost_policy_revision_id='19000000-0000-4000-8000-000000000001')
  then raise exception 'narrative Luna compatibility mismatch'; end if;
  if not exists(select 1 from tongs.openai_text_cost_policy_revisions
      where id='19000000-0000-4000-8000-000000000001' and maximum_input_units=4096
        and maximum_output_units=1024 and maximum_attempts=1 and lifecycle_state='active')
  then raise exception 'narrative runtime bounds mismatch'; end if;
  if not exists(select 1 from pg_class relation join pg_namespace namespace on namespace.oid=relation.relnamespace
      where namespace.nspname='tongs' and relation.relname='visual_narrative_interpretation_results'
        and relation.relrowsecurity and relation.relforcerowsecurity)
  then raise exception 'narrative result RLS must be enabled and forced'; end if;
  if has_table_privilege('authenticated','tongs.visual_narrative_interpretation_results','select')
    or has_table_privilege('authenticated','tongs.openai_text_validation_failure_evidence','select')
  then raise exception 'authenticated users must not read narrative provider evidence'; end if;
  if not has_table_privilege('service_role','tongs.visual_narrative_interpretation_results','select')
    or not has_table_privilege('service_role','tongs.openai_text_validation_failure_evidence','select')
  then raise exception 'service role must read narrative provider evidence'; end if;
end $$;

notify pgrst,'reload schema';
commit;
