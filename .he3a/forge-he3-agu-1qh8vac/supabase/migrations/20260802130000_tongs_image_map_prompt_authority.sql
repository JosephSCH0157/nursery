-- Immutable, replay-safe prompt authority for canonical image-map moments.
begin;

create table tongs.image_map_prompt_revisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null,
  image_moment_id text not null check (length(btrim(image_moment_id)) > 0),
  image_map_revision_id uuid not null,
  image_map_revision bigint not null check (image_map_revision > 0),
  script_approval_id uuid not null,
  script_approval_revision bigint not null check (script_approval_revision > 0),
  revision bigint not null check (revision > 0),
  previous_revision_id uuid,
  previous_revision bigint,
  source_context_json jsonb not null check (jsonb_typeof(source_context_json)='object'),
  creator_direction text not null check (length(btrim(creator_direction)) > 0),
  interpretation_contract_version text not null check (length(btrim(interpretation_contract_version)) > 0),
  validator_version text not null check (length(btrim(validator_version)) > 0),
  synthesis_contract_version text not null check (length(btrim(synthesis_contract_version)) > 0),
  interpretation_model text not null check (length(btrim(interpretation_model)) > 0),
  interpretation_request_json jsonb not null check (jsonb_typeof(interpretation_request_json)='object'),
  interpretation_response_json jsonb not null check (jsonb_typeof(interpretation_response_json)='object'),
  visual_brief_json jsonb not null check (jsonb_typeof(visual_brief_json)='object'),
  ai_synthesized_prompt text not null check (length(btrim(ai_synthesized_prompt)) > 0),
  final_prompt text not null check (length(btrim(final_prompt)) > 0),
  prompt_source text not null check (prompt_source in ('ai_derived','creator_edited')),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  immutable_revision_hash text not null check (immutable_revision_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (workspace_id,workpiece_id,image_moment_id,revision),
  unique (id,workspace_id,workpiece_id,image_moment_id,revision),
  unique (workspace_id,workpiece_id,image_moment_id,immutable_revision_hash),
  foreign key (workpiece_id,workspace_id) references tongs.episodes(id,workspace_id) on delete cascade,
  foreign key (image_map_revision_id,workspace_id,workpiece_id,image_map_revision)
    references tongs.image_map_revisions(id,workspace_id,workpiece_id,revision),
  foreign key (script_approval_id,workspace_id,workpiece_id,script_approval_revision)
    references tongs.script_approval_revisions(id,workspace_id,workpiece_id,approval_revision),
  foreign key (previous_revision_id,workspace_id,workpiece_id,image_moment_id,previous_revision)
    references tongs.image_map_prompt_revisions(id,workspace_id,workpiece_id,image_moment_id,revision),
  check ((previous_revision_id is null)=(previous_revision is null)),
  check ((revision=1 and previous_revision_id is null) or (revision>1 and previous_revision=revision-1))
);

create table tongs.image_map_prompt_sequences (
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null,
  image_moment_id text not null check (length(btrim(image_moment_id)) > 0),
  current_prompt_revision_id uuid,
  current_prompt_revision bigint not null default 0 check (current_prompt_revision >= 0),
  updated_at timestamptz not null default now(),
  primary key (workspace_id,workpiece_id,image_moment_id),
  foreign key (workpiece_id,workspace_id) references tongs.episodes(id,workspace_id) on delete cascade,
  foreign key (current_prompt_revision_id,workspace_id,workpiece_id,image_moment_id,current_prompt_revision)
    references tongs.image_map_prompt_revisions(id,workspace_id,workpiece_id,image_moment_id,revision),
  check ((current_prompt_revision_id is null and current_prompt_revision=0)
    or (current_prompt_revision_id is not null and current_prompt_revision>0))
);

create table tongs.image_map_prompt_operation_receipts (
  operation_id text primary key check (operation_id ~ '^forge:image-prompt:[a-zA-Z0-9._:-]{8,180}$'),
  operation_fingerprint text not null check (operation_fingerprint ~ '^[0-9a-f]{64}$'),
  operation_type text not null check (operation_type in ('interpretation','creator_edit')),
  state text not null check (state in ('pending','provider_completed','committed','failed')),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null,
  image_moment_id text not null,
  image_map_revision_id uuid not null,
  image_map_revision bigint not null,
  script_approval_id uuid not null,
  script_approval_revision bigint not null,
  expected_prompt_revision_id uuid,
  expected_prompt_revision bigint not null check (expected_prompt_revision >= 0),
  normalized_inputs_json jsonb not null check (jsonb_typeof(normalized_inputs_json)='object'),
  provider_response_json jsonb check (provider_response_json is null or jsonb_typeof(provider_response_json)='object'),
  provider_response_hash text check (provider_response_hash is null or provider_response_hash ~ '^[0-9a-f]{64}$'),
  failed_stage text,
  failure_code text,
  failure_message text,
  result_revision_id uuid,
  result_revision bigint,
  receipt_json jsonb check (receipt_json is null or jsonb_typeof(receipt_json)='object'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workpiece_id,workspace_id) references tongs.episodes(id,workspace_id) on delete cascade,
  foreign key (image_map_revision_id,workspace_id,workpiece_id,image_map_revision)
    references tongs.image_map_revisions(id,workspace_id,workpiece_id,revision),
  foreign key (script_approval_id,workspace_id,workpiece_id,script_approval_revision)
    references tongs.script_approval_revisions(id,workspace_id,workpiece_id,approval_revision),
  foreign key (expected_prompt_revision_id,workspace_id,workpiece_id,image_moment_id,expected_prompt_revision)
    references tongs.image_map_prompt_revisions(id,workspace_id,workpiece_id,image_moment_id,revision),
  foreign key (result_revision_id,workspace_id,workpiece_id,image_moment_id,result_revision)
    references tongs.image_map_prompt_revisions(id,workspace_id,workpiece_id,image_moment_id,revision),
  check ((expected_prompt_revision_id is null and expected_prompt_revision=0)
    or (expected_prompt_revision_id is not null and expected_prompt_revision>0)),
  check ((result_revision_id is null)=(result_revision is null)),
  check ((provider_response_json is null)=(provider_response_hash is null)),
  check ((state='pending' and provider_response_json is null and result_revision_id is null and receipt_json is null)
    or (state='provider_completed' and operation_type='interpretation' and provider_response_json is not null and result_revision_id is null and receipt_json is null)
    or (state='committed' and result_revision_id is not null and receipt_json is not null)
    or (state='failed' and failure_code is not null and failure_message is not null and result_revision_id is null and receipt_json is null))
);

create index image_map_prompt_revisions_current_idx on tongs.image_map_prompt_revisions(workspace_id,workpiece_id,image_moment_id,revision desc);
create index image_map_prompt_receipts_moment_idx on tongs.image_map_prompt_operation_receipts(workspace_id,workpiece_id,image_moment_id,created_at desc);

create or replace function tongs.reject_image_map_prompt_immutable_mutation() returns trigger
language plpgsql set search_path=pg_catalog,tongs as $function$
begin raise exception '% is immutable',tg_table_name using errcode='55000'; end $function$;
create trigger image_map_prompt_revisions_immutable before update or delete on tongs.image_map_prompt_revisions
  for each row execute function tongs.reject_image_map_prompt_immutable_mutation();

create or replace function tongs.guard_image_map_prompt_operation_receipt() returns trigger
language plpgsql set search_path=pg_catalog,tongs as $function$
begin
  if tg_op='DELETE' then raise exception 'image_map_prompt_operation_receipts is durable' using errcode='55000'; end if;
  if old.state='committed' then raise exception 'committed image prompt receipt is immutable' using errcode='55000'; end if;
  if new.operation_id<>old.operation_id
    or new.operation_fingerprint<>old.operation_fingerprint
    or new.operation_type<>old.operation_type
    or new.workspace_id<>old.workspace_id
    or new.workpiece_id<>old.workpiece_id
    or new.image_moment_id<>old.image_moment_id
    or new.image_map_revision_id<>old.image_map_revision_id
    or new.script_approval_id<>old.script_approval_id
    or new.created_by<>old.created_by
    or new.created_at<>old.created_at then
    raise exception 'image prompt operation identity is immutable' using errcode='55000';
  end if;
  return new;
end $function$;
create trigger image_map_prompt_receipts_guard before update or delete on tongs.image_map_prompt_operation_receipts
  for each row execute function tongs.guard_image_map_prompt_operation_receipt();

create or replace function tongs.validate_image_map_visual_brief(p_brief jsonb) returns text[]
language plpgsql immutable strict set search_path=pg_catalog,tongs as $function$
declare v_missing text[]:=array[]::text[]; v_key text; v_value jsonb;
begin
  foreach v_key in array array['narrative_purpose','central_message','primary_subjects','relationship_or_action','emotional_tone','visual_mode','setting','composition','essential_visual_evidence','avoid','source_context'] loop
    v_value:=p_brief->v_key;
    if v_value is null or v_value='null'::jsonb
      or (jsonb_typeof(v_value)='string' and length(btrim(v_value#>>'{}'))=0)
      or (jsonb_typeof(v_value)='array' and jsonb_array_length(v_value)=0)
      or (jsonb_typeof(v_value)='object' and v_value='{}'::jsonb) then
      v_missing:=array_append(v_missing,v_key);
    end if;
  end loop;
  if jsonb_typeof(p_brief->'primary_subjects') <> 'array' then v_missing:=array_append(v_missing,'primary_subjects:type'); end if;
  if jsonb_typeof(p_brief->'essential_visual_evidence') <> 'array' then v_missing:=array_append(v_missing,'essential_visual_evidence:type'); end if;
  if jsonb_typeof(p_brief->'avoid') <> 'array' then v_missing:=array_append(v_missing,'avoid:type'); end if;
  if p_brief->>'visual_mode' not in ('literal','documentary','editorial','metaphorical','historical_reconstruction','diagrammatic') then v_missing:=array_append(v_missing,'visual_mode:value'); end if;
  return v_missing;
end $function$;

create or replace function tongs.begin_image_prompt_interpretation(
  p_workspace_id uuid,p_workpiece_id uuid,p_image_moment_id text,
  p_image_map_revision_id uuid,p_script_approval_id uuid,
  p_expected_prompt_revision_id uuid,p_expected_prompt_revision bigint,
  p_operation_id text,p_operation_fingerprint text,p_normalized_inputs_json jsonb,p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $function$
declare v_seq tongs.image_map_prompt_sequences%rowtype; v_map tongs.image_map_revisions%rowtype; v_script tongs.script_approval_revisions%rowtype; v_op tongs.image_map_prompt_operation_receipts%rowtype;
begin
  if not tongs.has_workspace_role(p_workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id,0));
  select * into v_op from tongs.image_map_prompt_operation_receipts where operation_id=p_operation_id for update;
  if found then
    if v_op.workspace_id<>p_workspace_id or v_op.workpiece_id<>p_workpiece_id or v_op.image_moment_id<>p_image_moment_id then return jsonb_build_object('disposition','operation_identity_conflict'); end if;
    if v_op.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict'); end if;
    if v_op.state='failed' then
      update tongs.image_map_prompt_operation_receipts set state=case when provider_response_json is null then 'pending' else 'provider_completed' end,failed_stage=null,failure_code=null,failure_message=null,updated_at=now() where operation_id=p_operation_id returning * into v_op;
    end if;
    return jsonb_build_object('disposition','replay','operation',to_jsonb(v_op));
  end if;
  select * into v_map from tongs.image_map_revisions where id=p_image_map_revision_id and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
  if not found then return jsonb_build_object('disposition','image_map_revision_conflict'); end if;
  select * into v_script from tongs.script_approval_revisions where id=p_script_approval_id and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
  if not found or v_map.source_script_approval_id<>v_script.id then return jsonb_build_object('disposition','script_revision_conflict'); end if;
  if not exists(select 1 from jsonb_array_elements(v_map.document_json->'entries') e where e->>'id'=p_image_moment_id) then return jsonb_build_object('disposition','image_moment_not_found'); end if;
  insert into tongs.image_map_prompt_sequences(workspace_id,workpiece_id,image_moment_id) values(p_workspace_id,p_workpiece_id,p_image_moment_id) on conflict do nothing;
  select * into v_seq from tongs.image_map_prompt_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and image_moment_id=p_image_moment_id for update;
  if v_seq.current_prompt_revision<>p_expected_prompt_revision or v_seq.current_prompt_revision_id is distinct from p_expected_prompt_revision_id then
    return jsonb_build_object('disposition','prompt_revision_conflict','current_prompt_revision_id',v_seq.current_prompt_revision_id,'current_prompt_revision',v_seq.current_prompt_revision);
  end if;
  insert into tongs.image_map_prompt_operation_receipts(operation_id,operation_fingerprint,operation_type,state,workspace_id,workpiece_id,image_moment_id,image_map_revision_id,image_map_revision,script_approval_id,script_approval_revision,expected_prompt_revision_id,expected_prompt_revision,normalized_inputs_json,created_by)
  values(p_operation_id,p_operation_fingerprint,'interpretation','pending',p_workspace_id,p_workpiece_id,p_image_moment_id,v_map.id,v_map.revision,v_script.id,v_script.approval_revision,p_expected_prompt_revision_id,p_expected_prompt_revision,p_normalized_inputs_json,p_actor_id)
  returning * into v_op;
  return jsonb_build_object('disposition','reserved','operation',to_jsonb(v_op));
end $function$;

create or replace function tongs.record_image_prompt_provider_response(p_operation_id text,p_operation_fingerprint text,p_provider_response_json jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $function$
declare v_op tongs.image_map_prompt_operation_receipts%rowtype; v_hash text;
begin
  select * into v_op from tongs.image_map_prompt_operation_receipts where operation_id=p_operation_id for update;
  if not found then return jsonb_build_object('disposition','operation_not_found'); end if;
  if not tongs.has_workspace_role(v_op.workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501'; end if;
  if v_op.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict'); end if;
  if v_op.state in ('provider_completed','committed') then return jsonb_build_object('disposition','replay','operation',to_jsonb(v_op)); end if;
  if v_op.state<>'pending' then return jsonb_build_object('disposition','invalid_operation_state','state',v_op.state); end if;
  v_hash:=encode(extensions.digest(convert_to(p_provider_response_json::text,'UTF8'),'sha256'),'hex');
  update tongs.image_map_prompt_operation_receipts set state='provider_completed',provider_response_json=p_provider_response_json,provider_response_hash=v_hash,failed_stage=null,failure_code=null,failure_message=null,updated_at=now() where operation_id=p_operation_id returning * into v_op;
  return jsonb_build_object('disposition','provider_recorded','operation',to_jsonb(v_op));
end $function$;

create or replace function tongs.fail_image_prompt_operation(p_operation_id text,p_operation_fingerprint text,p_failed_stage text,p_failure_code text,p_failure_message text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $function$
declare v_op tongs.image_map_prompt_operation_receipts%rowtype;
begin
  select * into v_op from tongs.image_map_prompt_operation_receipts where operation_id=p_operation_id for update;
  if not found then return jsonb_build_object('disposition','operation_not_found'); end if;
  if not tongs.has_workspace_role(v_op.workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501'; end if;
  if v_op.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict'); end if;
  if v_op.state='committed' then return v_op.receipt_json; end if;
  update tongs.image_map_prompt_operation_receipts set state='failed',failed_stage=p_failed_stage,failure_code=p_failure_code,failure_message=p_failure_message,updated_at=now() where operation_id=p_operation_id returning * into v_op;
  return jsonb_build_object('disposition','failed','operation',to_jsonb(v_op));
end $function$;

create or replace function tongs.commit_image_prompt_interpretation(
 p_operation_id text,p_operation_fingerprint text,p_visual_brief_json jsonb,
 p_ai_synthesized_prompt text,p_final_prompt text,p_interpretation_contract_version text,
 p_validator_version text,p_synthesis_contract_version text,p_interpretation_model text,
 p_interpretation_request_json jsonb,p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $function$
declare v_op tongs.image_map_prompt_operation_receipts%rowtype; v_seq tongs.image_map_prompt_sequences%rowtype; v_rev tongs.image_map_prompt_revisions%rowtype; v_missing text[]; v_content text; v_content_hash text; v_immutable_hash text; v_receipt jsonb;
begin
  select * into v_op from tongs.image_map_prompt_operation_receipts where operation_id=p_operation_id for update;
  if not found then return jsonb_build_object('disposition','operation_not_found'); end if;
  if not tongs.has_workspace_role(v_op.workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501'; end if;
  if v_op.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict'); end if;
  if v_op.state='committed' then return v_op.receipt_json; end if;
  if v_op.state<>'provider_completed' then return jsonb_build_object('disposition','provider_response_required','state',v_op.state); end if;
  v_missing:=tongs.validate_image_map_visual_brief(p_visual_brief_json);
  if cardinality(v_missing)>0 then return jsonb_build_object('disposition','interpretation_incomplete','invalid_fields',to_jsonb(v_missing)); end if;
  select * into v_seq from tongs.image_map_prompt_sequences where workspace_id=v_op.workspace_id and workpiece_id=v_op.workpiece_id and image_moment_id=v_op.image_moment_id for update;
  if v_seq.current_prompt_revision<>v_op.expected_prompt_revision or v_seq.current_prompt_revision_id is distinct from v_op.expected_prompt_revision_id then return jsonb_build_object('disposition','prompt_revision_conflict','current_prompt_revision_id',v_seq.current_prompt_revision_id,'current_prompt_revision',v_seq.current_prompt_revision); end if;
  v_content:=jsonb_build_object('source_context',v_op.normalized_inputs_json->'source_context','creator_direction',v_op.normalized_inputs_json->>'creator_direction','visual_brief',p_visual_brief_json,'ai_synthesized_prompt',p_ai_synthesized_prompt,'final_prompt',p_final_prompt,'prompt_source','ai_derived','contracts',jsonb_build_object('interpretation',p_interpretation_contract_version,'validator',p_validator_version,'synthesis',p_synthesis_contract_version))::text;
  v_content_hash:=encode(extensions.digest(convert_to(v_content,'UTF8'),'sha256'),'hex');
  v_immutable_hash:=encode(extensions.digest(convert_to(jsonb_build_object('content_hash',v_content_hash,'operation_id',p_operation_id,'revision',v_seq.current_prompt_revision+1,'previous_revision_id',v_seq.current_prompt_revision_id)::text,'UTF8'),'sha256'),'hex');
  insert into tongs.image_map_prompt_revisions(workspace_id,workpiece_id,image_moment_id,image_map_revision_id,image_map_revision,script_approval_id,script_approval_revision,revision,previous_revision_id,previous_revision,source_context_json,creator_direction,interpretation_contract_version,validator_version,synthesis_contract_version,interpretation_model,interpretation_request_json,interpretation_response_json,visual_brief_json,ai_synthesized_prompt,final_prompt,prompt_source,content_hash,immutable_revision_hash,created_by)
  values(v_op.workspace_id,v_op.workpiece_id,v_op.image_moment_id,v_op.image_map_revision_id,v_op.image_map_revision,v_op.script_approval_id,v_op.script_approval_revision,v_seq.current_prompt_revision+1,v_seq.current_prompt_revision_id,nullif(v_seq.current_prompt_revision,0),v_op.normalized_inputs_json->'source_context',v_op.normalized_inputs_json->>'creator_direction',p_interpretation_contract_version,p_validator_version,p_synthesis_contract_version,p_interpretation_model,p_interpretation_request_json,v_op.provider_response_json,p_visual_brief_json,p_ai_synthesized_prompt,p_final_prompt,'ai_derived',v_content_hash,v_immutable_hash,p_actor_id) returning * into v_rev;
  update tongs.image_map_prompt_sequences set current_prompt_revision_id=v_rev.id,current_prompt_revision=v_rev.revision,updated_at=now() where workspace_id=v_rev.workspace_id and workpiece_id=v_rev.workpiece_id and image_moment_id=v_rev.image_moment_id;
  v_receipt:=jsonb_build_object('disposition','committed','prompt_revision',to_jsonb(v_rev),'provider_response_hash',v_op.provider_response_hash);
  update tongs.image_map_prompt_operation_receipts set state='committed',result_revision_id=v_rev.id,result_revision=v_rev.revision,receipt_json=v_receipt,failed_stage=null,failure_code=null,failure_message=null,updated_at=now() where operation_id=p_operation_id;
  return v_receipt;
end $function$;

create or replace function tongs.commit_image_prompt_creator_edit(
 p_workspace_id uuid,p_workpiece_id uuid,p_image_moment_id text,p_expected_prompt_revision_id uuid,p_expected_prompt_revision bigint,
 p_final_prompt text,p_operation_id text,p_operation_fingerprint text,p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $function$
declare v_seq tongs.image_map_prompt_sequences%rowtype; v_current tongs.image_map_prompt_revisions%rowtype; v_rev tongs.image_map_prompt_revisions%rowtype; v_op tongs.image_map_prompt_operation_receipts%rowtype; v_hash text; v_immutable text; v_receipt jsonb;
begin
  if not tongs.has_workspace_role(p_workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id,0));
  select * into v_op from tongs.image_map_prompt_operation_receipts where operation_id=p_operation_id for update;
  if found then if v_op.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict'); end if; return v_op.receipt_json; end if;
  select * into v_seq from tongs.image_map_prompt_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and image_moment_id=p_image_moment_id for update;
  if not found or v_seq.current_prompt_revision_id is distinct from p_expected_prompt_revision_id or v_seq.current_prompt_revision<>p_expected_prompt_revision then return jsonb_build_object('disposition','prompt_revision_conflict','current_prompt_revision_id',v_seq.current_prompt_revision_id,'current_prompt_revision',v_seq.current_prompt_revision); end if;
  select * into v_current from tongs.image_map_prompt_revisions where id=v_seq.current_prompt_revision_id;
  v_hash:=encode(extensions.digest(convert_to(jsonb_build_object('prior_content_hash',v_current.content_hash,'final_prompt',p_final_prompt,'prompt_source','creator_edited')::text,'UTF8'),'sha256'),'hex');
  v_immutable:=encode(extensions.digest(convert_to(jsonb_build_object('content_hash',v_hash,'operation_id',p_operation_id,'revision',v_current.revision+1,'previous_revision_id',v_current.id)::text,'UTF8'),'sha256'),'hex');
  insert into tongs.image_map_prompt_revisions(workspace_id,workpiece_id,image_moment_id,image_map_revision_id,image_map_revision,script_approval_id,script_approval_revision,revision,previous_revision_id,previous_revision,source_context_json,creator_direction,interpretation_contract_version,validator_version,synthesis_contract_version,interpretation_model,interpretation_request_json,interpretation_response_json,visual_brief_json,ai_synthesized_prompt,final_prompt,prompt_source,content_hash,immutable_revision_hash,created_by)
  select workspace_id,workpiece_id,image_moment_id,image_map_revision_id,image_map_revision,script_approval_id,script_approval_revision,revision+1,id,revision,source_context_json,creator_direction,interpretation_contract_version,validator_version,synthesis_contract_version,interpretation_model,interpretation_request_json,interpretation_response_json,visual_brief_json,ai_synthesized_prompt,p_final_prompt,'creator_edited',v_hash,v_immutable,p_actor_id from tongs.image_map_prompt_revisions where id=v_current.id returning * into v_rev;
  update tongs.image_map_prompt_sequences set current_prompt_revision_id=v_rev.id,current_prompt_revision=v_rev.revision,updated_at=now() where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and image_moment_id=p_image_moment_id;
  v_receipt:=jsonb_build_object('disposition','committed','prompt_revision',to_jsonb(v_rev));
  insert into tongs.image_map_prompt_operation_receipts(operation_id,operation_fingerprint,operation_type,state,workspace_id,workpiece_id,image_moment_id,image_map_revision_id,image_map_revision,script_approval_id,script_approval_revision,expected_prompt_revision_id,expected_prompt_revision,normalized_inputs_json,result_revision_id,result_revision,receipt_json,created_by)
  values(p_operation_id,p_operation_fingerprint,'creator_edit','committed',p_workspace_id,p_workpiece_id,p_image_moment_id,v_current.image_map_revision_id,v_current.image_map_revision,v_current.script_approval_id,v_current.script_approval_revision,v_current.id,v_current.revision,jsonb_build_object('final_prompt',p_final_prompt),v_rev.id,v_rev.revision,v_receipt,p_actor_id);
  return v_receipt;
end $function$;

create or replace function tongs.read_current_image_prompt(p_workspace_id uuid,p_workpiece_id uuid,p_image_moment_id text)
returns jsonb language sql stable security definer set search_path=pg_catalog,tongs as $function$
 select case when not tongs.has_workspace_role(p_workspace_id,'viewer') then null else
   (select jsonb_build_object('sequence',to_jsonb(s),'prompt_revision',to_jsonb(r)) from tongs.image_map_prompt_sequences s left join tongs.image_map_prompt_revisions r on r.id=s.current_prompt_revision_id where s.workspace_id=p_workspace_id and s.workpiece_id=p_workpiece_id and s.image_moment_id=p_image_moment_id) end
$function$;
create or replace function tongs.read_image_prompt_operation_receipt(p_workspace_id uuid,p_operation_id text)
returns jsonb language sql stable security definer set search_path=pg_catalog,tongs as $function$
 select case when not tongs.has_workspace_role(p_workspace_id,'viewer') then null else (select to_jsonb(o) from tongs.image_map_prompt_operation_receipts o where o.workspace_id=p_workspace_id and o.operation_id=p_operation_id) end
$function$;

alter table tongs.image_map_prompt_revisions enable row level security;
alter table tongs.image_map_prompt_sequences enable row level security;
alter table tongs.image_map_prompt_operation_receipts enable row level security;
create policy image_map_prompt_revisions_viewer on tongs.image_map_prompt_revisions for select to authenticated using(tongs.has_workspace_role(workspace_id,'viewer'));
create policy image_map_prompt_sequences_viewer on tongs.image_map_prompt_sequences for select to authenticated using(tongs.has_workspace_role(workspace_id,'viewer'));
create policy image_map_prompt_receipts_viewer on tongs.image_map_prompt_operation_receipts for select to authenticated using(tongs.has_workspace_role(workspace_id,'viewer'));
revoke all on tongs.image_map_prompt_revisions,tongs.image_map_prompt_sequences,tongs.image_map_prompt_operation_receipts from public,anon,authenticated;
grant select on tongs.image_map_prompt_revisions,tongs.image_map_prompt_sequences,tongs.image_map_prompt_operation_receipts to authenticated;
revoke all on function tongs.begin_image_prompt_interpretation(uuid,uuid,text,uuid,uuid,uuid,bigint,text,text,jsonb,uuid) from public,anon,authenticated;
revoke all on function tongs.record_image_prompt_provider_response(text,text,jsonb) from public,anon,authenticated;
revoke all on function tongs.fail_image_prompt_operation(text,text,text,text,text) from public,anon,authenticated;
revoke all on function tongs.commit_image_prompt_interpretation(text,text,jsonb,text,text,text,text,text,text,jsonb,uuid) from public,anon,authenticated;
revoke all on function tongs.commit_image_prompt_creator_edit(uuid,uuid,text,uuid,bigint,text,text,text,uuid) from public,anon,authenticated;
grant execute on function tongs.begin_image_prompt_interpretation(uuid,uuid,text,uuid,uuid,uuid,bigint,text,text,jsonb,uuid) to service_role;
grant execute on function tongs.record_image_prompt_provider_response(text,text,jsonb) to service_role;
grant execute on function tongs.fail_image_prompt_operation(text,text,text,text,text) to service_role;
grant execute on function tongs.commit_image_prompt_interpretation(text,text,jsonb,text,text,text,text,text,text,jsonb,uuid) to service_role;
grant execute on function tongs.commit_image_prompt_creator_edit(uuid,uuid,text,uuid,bigint,text,text,text,uuid) to service_role;
grant execute on function tongs.begin_image_prompt_interpretation(uuid,uuid,text,uuid,uuid,uuid,bigint,text,text,jsonb,uuid) to authenticated;
grant execute on function tongs.record_image_prompt_provider_response(text,text,jsonb) to authenticated;
grant execute on function tongs.fail_image_prompt_operation(text,text,text,text,text) to authenticated;
grant execute on function tongs.commit_image_prompt_interpretation(text,text,jsonb,text,text,text,text,text,text,jsonb,uuid) to authenticated;
grant execute on function tongs.commit_image_prompt_creator_edit(uuid,uuid,text,uuid,bigint,text,text,text,uuid) to authenticated;
grant execute on function tongs.read_current_image_prompt(uuid,uuid,text),tongs.read_image_prompt_operation_receipt(uuid,text) to authenticated,service_role;

commit;
