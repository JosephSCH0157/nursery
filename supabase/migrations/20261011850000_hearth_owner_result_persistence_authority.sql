-- Slice 4A: allow canonical Hearth product results to be authorized by either
-- the existing customer funding reservation or one Forge owner-cost attempt.
-- This migration activates no provider route and creates no financial entry.
begin;

-- Historical rows must remain unambiguously customer-funded. Fail before any
-- DDL if the hosted/local source data does not have that shape.
do $$
declare
  v_table text;
  v_missing bigint;
begin
  foreach v_table in array array[
    'openai_text_persisted_results',
    'hearth_script_generation_proposals',
    'hearth_research_synthesis_results',
    'hearth_title_generation_results',
    'hearth_tag_generation_results',
    'hearth_framing_pack_generation_results',
    'hearth_thumbnail_direction_generation_results',
    'visual_narrative_interpretation_results'
  ] loop
    execute format(
      'select count(*) from tongs.%I r left join tongs.funding_reservations f on f.id=r.reservation_id where r.reservation_id is null or f.id is null',
      v_table
    ) into v_missing;
    if v_missing <> 0 then
      raise exception 'owner-result authority migration found % ambiguous rows in tongs.%', v_missing, v_table;
    end if;
  end loop;
end $$;

-- Research originally relied on RPC validation rather than a physical
-- reservation FK. Add the missing FK before making the column nullable.
alter table tongs.hearth_research_synthesis_results
  add constraint hearth_research_synthesis_results_reservation_id_fkey
  foreign key (reservation_id) references tongs.funding_reservations(id) on delete restrict;

alter table tongs.openai_text_persisted_results
  alter column reservation_id drop not null,
  add column owner_cost_attempt_id uuid,
  add constraint openai_text_persisted_results_owner_attempt_fkey
    foreign key (owner_cost_attempt_id) references tongs.owner_cost_provider_attempts(attempt_id) on delete restrict,
  add constraint openai_text_persisted_results_execution_authority_check
    check (num_nonnulls(reservation_id, owner_cost_attempt_id) = 1);
create unique index openai_text_persisted_results_owner_attempt_uidx
  on tongs.openai_text_persisted_results(owner_cost_attempt_id)
  where owner_cost_attempt_id is not null;

alter table tongs.hearth_script_generation_proposals
  alter column reservation_id drop not null,
  add column owner_cost_attempt_id uuid,
  add constraint hearth_script_generation_proposals_owner_attempt_fkey
    foreign key (owner_cost_attempt_id) references tongs.owner_cost_provider_attempts(attempt_id) on delete restrict,
  add constraint hearth_script_generation_proposals_execution_authority_check
    check (num_nonnulls(reservation_id, owner_cost_attempt_id) = 1);
create unique index hearth_script_generation_proposals_owner_attempt_uidx
  on tongs.hearth_script_generation_proposals(owner_cost_attempt_id)
  where owner_cost_attempt_id is not null;

alter table tongs.hearth_research_synthesis_results
  alter column reservation_id drop not null,
  add column owner_cost_attempt_id uuid,
  add constraint hearth_research_synthesis_results_owner_attempt_fkey
    foreign key (owner_cost_attempt_id) references tongs.owner_cost_provider_attempts(attempt_id) on delete restrict,
  add constraint hearth_research_synthesis_results_execution_authority_check
    check (num_nonnulls(reservation_id, owner_cost_attempt_id) = 1);
create unique index hearth_research_synthesis_results_owner_attempt_uidx
  on tongs.hearth_research_synthesis_results(owner_cost_attempt_id)
  where owner_cost_attempt_id is not null;

alter table tongs.hearth_title_generation_results
  alter column reservation_id drop not null,
  add column owner_cost_attempt_id uuid,
  add constraint hearth_title_generation_results_owner_attempt_fkey
    foreign key (owner_cost_attempt_id) references tongs.owner_cost_provider_attempts(attempt_id) on delete restrict,
  add constraint hearth_title_generation_results_execution_authority_check
    check (num_nonnulls(reservation_id, owner_cost_attempt_id) = 1);
create unique index hearth_title_generation_results_owner_attempt_uidx
  on tongs.hearth_title_generation_results(owner_cost_attempt_id)
  where owner_cost_attempt_id is not null;

alter table tongs.hearth_tag_generation_results
  alter column reservation_id drop not null,
  add column owner_cost_attempt_id uuid,
  add constraint hearth_tag_generation_results_owner_attempt_fkey
    foreign key (owner_cost_attempt_id) references tongs.owner_cost_provider_attempts(attempt_id) on delete restrict,
  add constraint hearth_tag_generation_results_execution_authority_check
    check (num_nonnulls(reservation_id, owner_cost_attempt_id) = 1);
create unique index hearth_tag_generation_results_owner_attempt_uidx
  on tongs.hearth_tag_generation_results(owner_cost_attempt_id)
  where owner_cost_attempt_id is not null;

alter table tongs.hearth_framing_pack_generation_results
  alter column reservation_id drop not null,
  add column owner_cost_attempt_id uuid,
  add constraint hearth_framing_pack_results_owner_attempt_fkey
    foreign key (owner_cost_attempt_id) references tongs.owner_cost_provider_attempts(attempt_id) on delete restrict,
  add constraint hearth_framing_pack_results_execution_authority_check
    check (num_nonnulls(reservation_id, owner_cost_attempt_id) = 1);
create unique index hearth_framing_pack_results_owner_attempt_uidx
  on tongs.hearth_framing_pack_generation_results(owner_cost_attempt_id)
  where owner_cost_attempt_id is not null;

alter table tongs.hearth_thumbnail_direction_generation_results
  alter column reservation_id drop not null,
  add column owner_cost_attempt_id uuid,
  add constraint hearth_thumbnail_direction_results_owner_attempt_fkey
    foreign key (owner_cost_attempt_id) references tongs.owner_cost_provider_attempts(attempt_id) on delete restrict,
  add constraint hearth_thumbnail_direction_results_authority_check
    check (num_nonnulls(reservation_id, owner_cost_attempt_id) = 1);
create unique index hearth_thumbnail_direction_results_owner_attempt_uidx
  on tongs.hearth_thumbnail_direction_generation_results(owner_cost_attempt_id)
  where owner_cost_attempt_id is not null;

alter table tongs.visual_narrative_interpretation_results
  alter column reservation_id drop not null,
  add column owner_cost_attempt_id uuid,
  add constraint visual_narrative_results_owner_attempt_fkey
    foreign key (owner_cost_attempt_id) references tongs.owner_cost_provider_attempts(attempt_id) on delete restrict,
  add constraint visual_narrative_results_execution_authority_check
    check (num_nonnulls(reservation_id, owner_cost_attempt_id) = 1);
create unique index visual_narrative_results_owner_attempt_uidx
  on tongs.visual_narrative_interpretation_results(owner_cost_attempt_id)
  where owner_cost_attempt_id is not null;

-- Four result tables historically FK operation_id directly to the customer
-- funding binding. Preserve that customer FK through a generated conditional
-- key: customer rows still require the binding, while owner rows derive their
-- operation identity through owner_cost_attempt_id -> owner_cost_operation.
alter table tongs.openai_text_persisted_results
  drop constraint openai_text_persisted_results_operation_id_fkey,
  add column customer_operation_id text generated always as
    (case when reservation_id is not null then operation_id else null end) stored,
  add constraint openai_text_persisted_results_customer_operation_fkey
    foreign key (customer_operation_id) references tongs.openai_text_funding_bindings(operation_id) on delete restrict;

alter table tongs.hearth_framing_pack_generation_results
  drop constraint hearth_framing_pack_generation_results_operation_id_fkey,
  add column customer_operation_id text generated always as
    (case when reservation_id is not null then operation_id else null end) stored,
  add constraint hearth_framing_pack_results_customer_operation_fkey
    foreign key (customer_operation_id) references tongs.openai_text_funding_bindings(operation_id) on delete restrict;

alter table tongs.hearth_thumbnail_direction_generation_results
  drop constraint hearth_thumbnail_direction_generation_results_operation_id_fkey,
  add column customer_operation_id text generated always as
    (case when reservation_id is not null then operation_id else null end) stored,
  add constraint hearth_thumbnail_direction_results_customer_operation_fkey
    foreign key (customer_operation_id) references tongs.openai_text_funding_bindings(operation_id) on delete restrict;

alter table tongs.visual_narrative_interpretation_results
  drop constraint visual_narrative_interpretation_results_operation_id_fkey,
  add column customer_operation_id text generated always as
    (case when reservation_id is not null then operation_id else null end) stored,
  add constraint visual_narrative_results_customer_operation_fkey
    foreign key (customer_operation_id) references tongs.openai_text_funding_bindings(operation_id) on delete restrict;

create or replace function tongs._assert_owner_hearth_result_authority(
  p_owner_cost_attempt_id uuid,
  p_route_code text,
  p_user_id uuid,
  p_workspace_id uuid,
  p_workpiece_id uuid,
  p_request_fingerprint text,
  p_financial_environment text,
  p_runtime_environment text,
  p_provider_request_id text,
  p_model text
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare
  v_attempt tongs.owner_cost_provider_attempts%rowtype;
  v_operation tongs.owner_cost_operations%rowtype;
  v_latest_state text;
  v_provider_reference text;
  v_route text := lower(btrim(coalesce(p_route_code,'')));
  v_fingerprint text := lower(btrim(coalesce(p_request_fingerprint,'')));
  v_financial text := lower(btrim(coalesce(p_financial_environment,'')));
  v_runtime text := lower(btrim(coalesce(p_runtime_environment,'')));
begin
  perform tongs._require_accounting_service_role();
  if p_owner_cost_attempt_id is null or p_user_id is null or p_workspace_id is null
     or p_workpiece_id is null or v_fingerprint !~ '^[0-9a-f]{64}$'
     or v_financial not in ('live','test')
     or v_runtime not in ('production','preview','development') then
    raise exception 'invalid owner Hearth result authority request' using errcode='22023';
  end if;
  select * into v_attempt from tongs.owner_cost_provider_attempts
    where attempt_id=p_owner_cost_attempt_id;
  if not found then raise exception 'owner-cost attempt not found' using errcode='23503'; end if;
  select * into v_operation from tongs.owner_cost_operations
    where operation_id=v_attempt.operation_id;
  if not found then raise exception 'owner-cost operation not found' using errcode='23503'; end if;
  select e.lifecycle_state into v_latest_state
    from tongs.owner_cost_attempt_events e
    where e.attempt_id=v_attempt.attempt_id order by e.event_sequence desc limit 1;
  select e.provider_reference_id into v_provider_reference
    from tongs.owner_cost_attempt_events e
    where e.attempt_id=v_attempt.attempt_id and e.provider_reference_id is not null
    order by e.event_sequence desc limit 1;
  if v_operation.payer<>'forge' or v_operation.originating_tool<>'hearth'
     or v_operation.operation_type<>v_route
     or v_operation.financial_environment<>v_financial
     or v_operation.runtime_environment<>v_runtime
     or v_operation.workspace_id is distinct from p_workspace_id
     or v_operation.workpiece_id is distinct from p_workpiece_id
     or v_operation.request_fingerprint<>v_fingerprint
     or v_attempt.request_fingerprint<>v_fingerprint
     or v_attempt.provider<>'openai'
     or v_latest_state not in ('response_captured','succeeded')
     or (nullif(btrim(coalesce(p_model,'')),'') is not null
       and v_attempt.model is distinct from nullif(btrim(p_model),''))
     or (nullif(btrim(coalesce(p_provider_request_id,'')),'') is not null
       and v_provider_reference is not null
       and v_provider_reference is distinct from nullif(btrim(p_provider_request_id),''))
  then raise exception 'owner Hearth result authority mismatch' using errcode='42501'; end if;
  if not exists (
    select 1 from tongs.workspaces w
    where w.id=p_workspace_id and (
      w.created_by=p_user_id
      or exists(select 1 from tongs.workspace_members m where m.workspace_id=w.id and m.user_id=p_user_id)
      or tongs.is_platform_operator(p_user_id)
    )
  ) then raise exception 'owner Hearth result user cannot access workspace' using errcode='42501'; end if;
  return jsonb_build_object(
    'operation_id',v_operation.operation_id,
    'operation_key',v_operation.operation_key,
    'attempt_id',v_attempt.attempt_id,
    'route_code',v_route
  );
end $$;

create or replace function tongs._assert_owner_hearth_script_approval(
  p_workspace_id uuid,p_workpiece_id uuid,p_approval_id uuid,
  p_approval_revision integer,p_script_content_hash text
) returns void language plpgsql stable security definer set search_path=pg_catalog as $$
declare
  v_approval tongs.script_approval_revisions%rowtype;
  v_sequence tongs.workpiece_script_approval_sequences%rowtype;
begin
  perform tongs._require_accounting_service_role();
  select * into v_approval from tongs.script_approval_revisions
    where id=p_approval_id and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
  select * into v_sequence from tongs.workpiece_script_approval_sequences
    where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
  if v_approval.id is null or v_approval.approval_revision<>p_approval_revision
     or v_approval.script_content_hash<>lower(btrim(coalesce(p_script_content_hash,'')))
     or encode(extensions.digest(convert_to(v_approval.script_text,'utf8'),'sha256'),'hex')<>v_approval.script_content_hash
     or v_sequence.current_approval_id is distinct from p_approval_id
     or v_sequence.current_revision is distinct from p_approval_revision
  then raise exception 'owner Hearth result script authority mismatch' using errcode='42501'; end if;
end $$;

create or replace function tongs.persist_owner_hearth_text_result(
  p_owner_cost_attempt_id uuid,p_route_code text,p_user_id uuid,
  p_workspace_id uuid,p_workpiece_id uuid,p_request_fingerprint text,
  p_financial_environment text,p_runtime_environment text,
  p_provider_request_id text,p_model text,p_input_units bigint,p_output_units bigint,
  p_result_hash text,p_result_json jsonb,p_approval_id uuid default null,
  p_approval_revision integer default null,p_script_content_hash text default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_authority jsonb;
  v_operation_key text;
  v_route text:=lower(btrim(coalesce(p_route_code,'')));
  v_table text;
  v_existing jsonb;
  v_result_id uuid;
  v_hash text:=nullif(lower(btrim(coalesce(p_result_hash,''))), '');
  v_max_input bigint;
  v_max_output bigint;
begin
  perform tongs._require_accounting_service_role();
  if v_route not in (
    'hearth.chat_completion','hearth.script_generation','hearth.research_synthesis',
    'hearth.title_generation','hearth.tag_generation','hearth.framing_pack_generation',
    'hearth.thumbnail_direction_generation'
  ) or p_input_units<0 or p_output_units<0
    or jsonb_typeof(coalesce(p_result_json,'null'::jsonb))<>'object' then
    raise exception 'invalid owner Hearth text result' using errcode='22023';
  end if;
  v_authority:=tongs._assert_owner_hearth_result_authority(
    p_owner_cost_attempt_id,v_route,p_user_id,p_workspace_id,p_workpiece_id,
    p_request_fingerprint,p_financial_environment,p_runtime_environment,
    p_provider_request_id,p_model
  );
  v_operation_key:=v_authority->>'operation_key';
  select limits.max_input,limits.max_output into v_max_input,v_max_output
  from (values
    ('hearth.chat_completion'::text,64000::bigint,16000::bigint),
    ('hearth.script_generation',32000,8000),
    ('hearth.research_synthesis',64000,16000),
    ('hearth.title_generation',12000,512),
    ('hearth.tag_generation',12000,256),
    ('hearth.framing_pack_generation',12000,2048),
    ('hearth.thumbnail_direction_generation',12000,2048)
  ) limits(route_code,max_input,max_output) where limits.route_code=v_route;
  if p_input_units>v_max_input or p_output_units>v_max_output then
    raise exception 'owner Hearth text result usage exceeds route bounds' using errcode='22023';
  end if;
  if v_route='hearth.chat_completion' and (
      nullif(btrim(coalesce(p_model,'')),'') is null or v_hash !~ '^[0-9a-f]{64}$'
    ) then raise exception 'owner Hearth chat result requires model and result hash' using errcode='22023'; end if;
  if v_route='hearth.script_generation' and (
      nullif(btrim(coalesce(p_result_json->>'assistant_text','')),'') is null
      or jsonb_typeof(p_result_json->'ops')<>'array'
      or jsonb_array_length(p_result_json->'ops')<>1
      or p_result_json->'ops'->0->>'op'<>'set_body'
      or p_result_json->>'script_text' is distinct from p_result_json->'ops'->0->>'value'
    ) then raise exception 'invalid owner Hearth script proposal' using errcode='22023'; end if;
  if v_route in (
    'hearth.title_generation','hearth.tag_generation','hearth.framing_pack_generation',
    'hearth.thumbnail_direction_generation'
  ) then
    perform tongs._assert_owner_hearth_script_approval(
      p_workspace_id,p_workpiece_id,p_approval_id,p_approval_revision,p_script_content_hash
    );
  end if;
  if v_route='hearth.title_generation' and (
      coalesce(p_result_json->>'contract','') not in ('forge.hearth.title-generation.v1','forge.hearth.title-generation.v2')
      or jsonb_typeof(p_result_json->'titles')<>'array'
      or jsonb_array_length(p_result_json->'titles')<>5
    ) then raise exception 'invalid owner Hearth title result' using errcode='22023'; end if;
  if v_route='hearth.tag_generation' and (
      p_result_json->>'contract' is distinct from 'forge.hearth.tag-generation.v1'
      or jsonb_typeof(p_result_json->'tags')<>'array'
      or jsonb_array_length(p_result_json->'tags') not between 6 and 10
    ) then raise exception 'invalid owner Hearth tag result' using errcode='22023'; end if;

  v_result_id:=extensions.uuid_generate_v5(p_owner_cost_attempt_id,'owner-hearth-result:'||v_route);
  perform pg_advisory_xact_lock(hashtextextended('owner-hearth-result:'||p_owner_cost_attempt_id::text,0));
  v_table:=case v_route
    when 'hearth.chat_completion' then 'openai_text_persisted_results'
    when 'hearth.script_generation' then 'hearth_script_generation_proposals'
    when 'hearth.research_synthesis' then 'hearth_research_synthesis_results'
    when 'hearth.title_generation' then 'hearth_title_generation_results'
    when 'hearth.tag_generation' then 'hearth_tag_generation_results'
    when 'hearth.framing_pack_generation' then 'hearth_framing_pack_generation_results'
    when 'hearth.thumbnail_direction_generation' then 'hearth_thumbnail_direction_generation_results'
  end;
  execute format('select to_jsonb(r) from tongs.%I r where r.owner_cost_attempt_id=$1 or r.operation_id=$2 limit 1',v_table)
    into v_existing using p_owner_cost_attempt_id,v_operation_key;
  if v_existing is not null then
    if v_existing->>'owner_cost_attempt_id' is distinct from p_owner_cost_attempt_id::text
       or v_existing->>'operation_id' is distinct from v_operation_key
       or v_existing->>'request_fingerprint' is distinct from lower(p_request_fingerprint)
       or v_existing->'result_json' is distinct from p_result_json
       or (v_route='hearth.chat_completion' and v_existing->>'result_hash' is distinct from v_hash)
    then raise exception 'owner Hearth result replay conflict' using errcode='23505'; end if;
    return v_existing||jsonb_build_object('replay',true,'authority','owner_cost_provider_attempt');
  end if;

  if v_route='hearth.chat_completion' then
    insert into tongs.openai_text_persisted_results(
      id,reservation_id,owner_cost_attempt_id,operation_id,route_code,user_id,workspace_id,
      workpiece_id,request_fingerprint,provider_request_id,model,input_units,output_units,
      result_hash,result_json
    ) values(
      v_result_id,null,p_owner_cost_attempt_id,v_operation_key,v_route,p_user_id,p_workspace_id,
      p_workpiece_id::text,lower(p_request_fingerprint),nullif(btrim(coalesce(p_provider_request_id,'')),''),
      btrim(p_model),p_input_units,p_output_units,v_hash,p_result_json
    );
  elsif v_route='hearth.script_generation' then
    insert into tongs.hearth_script_generation_proposals(
      id,operation_id,reservation_id,owner_cost_attempt_id,user_id,workspace_id,workpiece_id,
      request_fingerprint,provider_request_id,input_units,output_units,result_json
    ) values(v_result_id,v_operation_key,null,p_owner_cost_attempt_id,p_user_id,p_workspace_id,p_workpiece_id,
      lower(p_request_fingerprint),nullif(btrim(coalesce(p_provider_request_id,'')),''),p_input_units,p_output_units,p_result_json);
  elsif v_route='hearth.research_synthesis' then
    insert into tongs.hearth_research_synthesis_results(
      id,operation_id,reservation_id,owner_cost_attempt_id,user_id,workspace_id,workpiece_id,
      request_fingerprint,provider_request_id,input_units,output_units,result_json
    ) values(v_result_id,v_operation_key,null,p_owner_cost_attempt_id,p_user_id,p_workspace_id,p_workpiece_id,
      lower(p_request_fingerprint),nullif(btrim(coalesce(p_provider_request_id,'')),''),p_input_units,p_output_units,p_result_json);
  else
    execute format(
      'insert into tongs.%I(id,operation_id,reservation_id,owner_cost_attempt_id,user_id,workspace_id,workpiece_id,request_fingerprint,approval_id,approval_revision,script_content_hash,provider_request_id,input_units,output_units,result_json) values($1,$2,null,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
      v_table
    ) using v_result_id,v_operation_key,p_owner_cost_attempt_id,p_user_id,p_workspace_id,p_workpiece_id,
      lower(p_request_fingerprint),p_approval_id,p_approval_revision,lower(p_script_content_hash),
      nullif(btrim(coalesce(p_provider_request_id,'')),''),p_input_units,p_output_units,p_result_json;
  end if;
  execute format('select to_jsonb(r) from tongs.%I r where r.owner_cost_attempt_id=$1',v_table)
    into v_existing using p_owner_cost_attempt_id;
  return v_existing||jsonb_build_object('replay',false,'authority','owner_cost_provider_attempt');
end $$;

create or replace function tongs.read_owner_hearth_text_result(
  p_owner_cost_attempt_id uuid,p_route_code text
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare
  v_route text:=lower(btrim(coalesce(p_route_code,'')));
  v_table text;
  v_result jsonb;
begin
  perform tongs._require_owner_cost_reader();
  v_table:=case v_route
    when 'hearth.chat_completion' then 'openai_text_persisted_results'
    when 'hearth.script_generation' then 'hearth_script_generation_proposals'
    when 'hearth.research_synthesis' then 'hearth_research_synthesis_results'
    when 'hearth.title_generation' then 'hearth_title_generation_results'
    when 'hearth.tag_generation' then 'hearth_tag_generation_results'
    when 'hearth.framing_pack_generation' then 'hearth_framing_pack_generation_results'
    when 'hearth.thumbnail_direction_generation' then 'hearth_thumbnail_direction_generation_results'
    else null end;
  if v_table is null then raise exception 'unsupported owner Hearth result route' using errcode='22023'; end if;
  execute format(
    'select to_jsonb(r)||jsonb_build_object(''owner_operation'',jsonb_build_object(''operation_id'',o.operation_id,''operation_key'',o.operation_key,''workspace_id'',o.workspace_id,''workpiece_id'',o.workpiece_id,''financial_environment'',o.financial_environment,''runtime_environment'',o.runtime_environment),''valuations'',coalesce((select jsonb_agg(jsonb_build_object(''valuation_id'',v.valuation_id,''basis'',v.valuation_basis,''recognition_mode'',v.recognition_mode,''journal_event_id'',v.journal_event_id) order by v.revision) from tongs.owner_cost_valuations v where v.attempt_id=a.attempt_id),''[]''::jsonb)) from tongs.%I r join tongs.owner_cost_provider_attempts a on a.attempt_id=r.owner_cost_attempt_id join tongs.owner_cost_operations o on o.operation_id=a.operation_id where r.owner_cost_attempt_id=$1',
    v_table
  ) into v_result using p_owner_cost_attempt_id;
  return v_result;
end $$;

create or replace function tongs.stage_owner_visual_narrative_interpretation_result(
  p_owner_cost_attempt_id uuid,p_user_id uuid,p_workspace_id uuid,p_workpiece_id uuid,
  p_request_fingerprint text,p_financial_environment text,p_runtime_environment text,
  p_provider_body_sha256 text,p_provider_request_id text,p_model text,
  p_input_units bigint,p_output_units bigint,p_visual_brief_json jsonb,p_contracts_json jsonb,
  p_image_map_revision_id uuid,p_image_map_revision bigint,p_script_approval_id uuid,
  p_script_approval_revision bigint,p_creator_direction text,p_visual_style text,
  p_synthesized_prompt text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_authority jsonb;
  v_operation_key text;
  v_map tongs.image_map_revisions%rowtype;
  v_existing tongs.visual_narrative_interpretation_results%rowtype;
  v_result_id uuid:=extensions.uuid_generate_v5(p_owner_cost_attempt_id,'owner-visual-narrative-result');
begin
  perform tongs._require_accounting_service_role();
  v_authority:=tongs._assert_owner_hearth_result_authority(
    p_owner_cost_attempt_id,'visual.narrative_interpretation',p_user_id,p_workspace_id,p_workpiece_id,
    p_request_fingerprint,p_financial_environment,p_runtime_environment,p_provider_request_id,p_model
  );
  v_operation_key:=v_authority->>'operation_key';
  select * into v_map from tongs.image_map_revisions where id=p_image_map_revision_id;
  if lower(coalesce(p_provider_body_sha256,'')) !~ '^[0-9a-f]{64}$'
     or p_model<>'gpt-5.6-luna' or p_input_units not between 0 and 4096
     or p_output_units not between 0 and 1024
     or cardinality(tongs.validate_image_map_visual_brief(p_visual_brief_json))>0
     or p_contracts_json<>jsonb_build_object(
       'interpretation','forge.image-prompt-interpretation.v2',
       'validator','forge.image-prompt-validator.v2',
       'synthesis','forge.image-prompt-synthesis.v3')
     or v_map.id is null or v_map.workspace_id<>p_workspace_id or v_map.workpiece_id<>p_workpiece_id
     or v_map.revision<>p_image_map_revision or v_map.source_script_approval_id<>p_script_approval_id
     or v_map.source_script_approval_revision<>p_script_approval_revision
     or length(btrim(coalesce(p_creator_direction,'')))=0
     or length(btrim(coalesce(p_synthesized_prompt,'')))=0
  then raise exception 'invalid owner visual narrative result evidence' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('owner-visual-narrative-result:'||p_owner_cost_attempt_id::text,0));
  select * into v_existing from tongs.visual_narrative_interpretation_results
    where owner_cost_attempt_id=p_owner_cost_attempt_id or operation_id=v_operation_key;
  if found then
    if v_existing.owner_cost_attempt_id<>p_owner_cost_attempt_id
       or v_existing.request_fingerprint<>lower(p_request_fingerprint)
       or v_existing.provider_body_sha256<>lower(p_provider_body_sha256)
       or v_existing.visual_brief_json<>p_visual_brief_json
       or v_existing.synthesized_prompt<>p_synthesized_prompt
    then raise exception 'owner visual narrative result replay conflict' using errcode='23505'; end if;
    return to_jsonb(v_existing)||jsonb_build_object('replay',true,'authority','owner_cost_provider_attempt');
  end if;
  insert into tongs.visual_narrative_interpretation_results(
    id,operation_id,reservation_id,owner_cost_attempt_id,user_id,workspace_id,workpiece_id,
    request_fingerprint,provider_body_sha256,provider_request_id,model,input_units,output_units,
    visual_brief_json,contracts_json,image_map_revision_id,image_map_revision,script_approval_id,
    script_approval_revision,creator_direction,visual_style,synthesized_prompt
  ) values(
    v_result_id,v_operation_key,null,p_owner_cost_attempt_id,p_user_id,p_workspace_id,p_workpiece_id,
    lower(p_request_fingerprint),lower(p_provider_body_sha256),nullif(btrim(coalesce(p_provider_request_id,'')),''),
    p_model,p_input_units,p_output_units,p_visual_brief_json,p_contracts_json,p_image_map_revision_id,
    p_image_map_revision,p_script_approval_id,p_script_approval_revision,btrim(p_creator_direction),
    nullif(btrim(coalesce(p_visual_style,'')),''),p_synthesized_prompt
  ) returning * into v_existing;
  return to_jsonb(v_existing)||jsonb_build_object('replay',false,'authority','owner_cost_provider_attempt');
end $$;

create or replace function tongs.read_owner_visual_narrative_interpretation_result(
  p_owner_cost_attempt_id uuid
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_result jsonb;
begin
  perform tongs._require_owner_cost_reader();
  select to_jsonb(r)||jsonb_build_object(
    'owner_operation',jsonb_build_object(
      'operation_id',o.operation_id,'operation_key',o.operation_key,
      'workspace_id',o.workspace_id,'workpiece_id',o.workpiece_id,
      'financial_environment',o.financial_environment,'runtime_environment',o.runtime_environment),
    'canonical_receipt',case when receipt.result_id is null then null else to_jsonb(receipt) end
  ) into v_result
  from tongs.visual_narrative_interpretation_results r
  join tongs.owner_cost_provider_attempts a on a.attempt_id=r.owner_cost_attempt_id
  join tongs.owner_cost_operations o on o.operation_id=a.operation_id
  left join tongs.visual_narrative_interpretation_canonical_receipts receipt on receipt.result_id=r.id
  where r.owner_cost_attempt_id=p_owner_cost_attempt_id;
  return v_result;
end $$;

revoke all on function tongs._assert_owner_hearth_result_authority(uuid,text,uuid,uuid,uuid,text,text,text,text,text) from public,anon,authenticated;
revoke all on function tongs._assert_owner_hearth_script_approval(uuid,uuid,uuid,integer,text) from public,anon,authenticated;
revoke all on function tongs.persist_owner_hearth_text_result(uuid,text,uuid,uuid,uuid,text,text,text,text,text,bigint,bigint,text,jsonb,uuid,integer,text) from public,anon,authenticated;
revoke all on function tongs.read_owner_hearth_text_result(uuid,text) from public,anon;
revoke all on function tongs.stage_owner_visual_narrative_interpretation_result(uuid,uuid,uuid,uuid,text,text,text,text,text,text,bigint,bigint,jsonb,jsonb,uuid,bigint,uuid,bigint,text,text,text) from public,anon,authenticated;
revoke all on function tongs.read_owner_visual_narrative_interpretation_result(uuid) from public,anon;

grant execute on function tongs.persist_owner_hearth_text_result(uuid,text,uuid,uuid,uuid,text,text,text,text,text,bigint,bigint,text,jsonb,uuid,integer,text) to service_role;
grant execute on function tongs.stage_owner_visual_narrative_interpretation_result(uuid,uuid,uuid,uuid,text,text,text,text,text,text,bigint,bigint,jsonb,jsonb,uuid,bigint,uuid,bigint,text,text,text) to service_role;
grant execute on function tongs.read_owner_hearth_text_result(uuid,text) to authenticated,service_role;
grant execute on function tongs.read_owner_visual_narrative_interpretation_result(uuid) to authenticated,service_role;

comment on function tongs.persist_owner_hearth_text_result(uuid,text,uuid,uuid,uuid,text,text,text,text,text,bigint,bigint,text,jsonb,uuid,integer,text)
  is 'Private owner-funded Hearth result persistence. Authority is one Forge owner-cost provider attempt; no customer financial objects are read or created.';
comment on column tongs.openai_text_persisted_results.owner_cost_attempt_id
  is 'Mutually exclusive owner execution authority; never a customer balance or reservation.';

notify pgrst,'reload schema';
commit;
