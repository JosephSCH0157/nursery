-- Canonical immutable, replay-safe B-roll authority.
begin;

alter table tongs.assets
  drop constraint if exists assets_asset_kind_check,
  add constraint assets_asset_kind_check check(asset_kind in(
    'thumbnail_image','thumbnail_composite','image_map_json','image_map_candidate_image','broll_candidate_video','broll_candidate_poster'
  )),
  drop constraint if exists assets_kind_shape_check,
  add constraint assets_kind_shape_check check(
    (asset_kind in('thumbnail_image','thumbnail_composite','broll_candidate_poster') and mime_type like 'image/%')
    or (asset_kind='image_map_json' and mime_type='application/json' and prompt is null)
    or (asset_kind='image_map_candidate_image' and mime_type like 'image/%' and prompt is not null)
    or (asset_kind='broll_candidate_video' and mime_type like 'video/%')
  );

create table tongs.broll_plan_revisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null,
  revision bigint not null check(revision>0),
  previous_revision_id uuid,
  previous_revision bigint,
  script_approval_id uuid not null,
  script_approval_revision bigint not null check(script_approval_revision>0),
  script_content_hash text not null check(script_content_hash~'^[0-9a-f]{64}$'),
  source_context_contract_version text not null check(length(btrim(source_context_contract_version))>0),
  content_hash text not null check(content_hash~'^[0-9a-f]{64}$'),
  immutable_revision_hash text not null check(immutable_revision_hash~'^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(workspace_id,workpiece_id,revision),
  unique(id,workspace_id,workpiece_id,revision),
  unique(workspace_id,workpiece_id,immutable_revision_hash),
  foreign key(workpiece_id,workspace_id) references tongs.episodes(id,workspace_id) on delete cascade,
  foreign key(script_approval_id,workspace_id,workpiece_id,script_approval_revision)
    references tongs.script_approval_revisions(id,workspace_id,workpiece_id,approval_revision),
  foreign key(previous_revision_id,workspace_id,workpiece_id,previous_revision)
    references tongs.broll_plan_revisions(id,workspace_id,workpiece_id,revision),
  check((previous_revision_id is null)=(previous_revision is null)),
  check((revision=1 and previous_revision_id is null) or (revision>1 and previous_revision=revision-1))
);

create table tongs.broll_plan_sequences (
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null,
  current_plan_revision_id uuid,
  current_plan_revision bigint not null default 0 check(current_plan_revision>=0),
  current_selection_revision bigint not null default 0 check(current_selection_revision>=0),
  updated_at timestamptz not null default now(),
  primary key(workspace_id,workpiece_id),
  foreign key(workpiece_id,workspace_id) references tongs.episodes(id,workspace_id) on delete cascade,
  foreign key(current_plan_revision_id,workspace_id,workpiece_id,current_plan_revision)
    references tongs.broll_plan_revisions(id,workspace_id,workpiece_id,revision),
  check((current_plan_revision_id is null and current_plan_revision=0) or (current_plan_revision_id is not null and current_plan_revision>0))
);

create table tongs.broll_beat_revisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null,
  beat_id uuid not null,
  revision bigint not null check(revision>0),
  previous_revision_id uuid,
  previous_revision bigint,
  source_plan_revision_id uuid not null,
  source_plan_revision bigint not null,
  script_approval_id uuid not null,
  script_approval_revision bigint not null,
  context_before text not null default '',
  context_focus text not null check(length(btrim(context_focus))>0),
  context_after text not null default '',
  canonical_anchor_assessment jsonb not null check(jsonb_typeof(canonical_anchor_assessment)='object'),
  narrative_purpose text not null check(length(btrim(narrative_purpose))>0),
  placement_hint text not null check(length(btrim(placement_hint))>0),
  duration_target_ms bigint not null check(duration_target_ms>0),
  shot_type text not null check(length(btrim(shot_type))>0),
  motion_intent text not null check(length(btrim(motion_intent))>0),
  mood_pacing text not null check(length(btrim(mood_pacing))>0),
  asset_category text not null check(length(btrim(asset_category))>0),
  trim_guidance_json jsonb not null default '{}'::jsonb check(jsonb_typeof(trim_guidance_json)='object'),
  content_hash text not null check(content_hash~'^[0-9a-f]{64}$'),
  immutable_revision_hash text not null check(immutable_revision_hash~'^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(workspace_id,workpiece_id,beat_id,revision),
  unique(id,workspace_id,workpiece_id,beat_id,revision),
  foreign key(workpiece_id,workspace_id) references tongs.episodes(id,workspace_id) on delete cascade,
  foreign key(source_plan_revision_id,workspace_id,workpiece_id,source_plan_revision)
    references tongs.broll_plan_revisions(id,workspace_id,workpiece_id,revision),
  foreign key(script_approval_id,workspace_id,workpiece_id,script_approval_revision)
    references tongs.script_approval_revisions(id,workspace_id,workpiece_id,approval_revision),
  foreign key(previous_revision_id,workspace_id,workpiece_id,beat_id,previous_revision)
    references tongs.broll_beat_revisions(id,workspace_id,workpiece_id,beat_id,revision),
  check((previous_revision_id is null)=(previous_revision is null)),
  check((revision=1 and previous_revision_id is null) or (revision>1 and previous_revision=revision-1))
);

create table tongs.broll_plan_beat_membership (
  plan_revision_id uuid not null,
  workspace_id uuid not null,
  workpiece_id uuid not null,
  plan_revision bigint not null,
  ordinal integer not null check(ordinal>0),
  beat_id uuid not null,
  beat_revision_id uuid not null,
  beat_revision bigint not null,
  primary key(plan_revision_id,ordinal),
  unique(plan_revision_id,beat_id),
  foreign key(plan_revision_id,workspace_id,workpiece_id,plan_revision)
    references tongs.broll_plan_revisions(id,workspace_id,workpiece_id,revision) on delete cascade,
  foreign key(beat_revision_id,workspace_id,workpiece_id,beat_id,beat_revision)
    references tongs.broll_beat_revisions(id,workspace_id,workpiece_id,beat_id,revision)
);

create table tongs.broll_prompt_revisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null,
  beat_id uuid not null,
  revision bigint not null check(revision>0),
  previous_revision_id uuid,
  previous_revision bigint,
  source_beat_revision_id uuid not null,
  source_beat_revision bigint not null,
  motion_brief_json jsonb not null check(jsonb_typeof(motion_brief_json)='object'),
  final_prompt text not null check(length(btrim(final_prompt))>0),
  prompt_source text not null check(prompt_source in('ai_derived','creator_edited')),
  interpretation_contract_version text not null,
  validator_version text not null,
  synthesis_contract_version text not null,
  provider_response_json jsonb,
  content_hash text not null check(content_hash~'^[0-9a-f]{64}$'),
  immutable_revision_hash text not null check(immutable_revision_hash~'^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(workspace_id,workpiece_id,beat_id,revision),
  unique(id,workspace_id,workpiece_id,beat_id,revision),
  foreign key(workpiece_id,workspace_id) references tongs.episodes(id,workspace_id) on delete cascade,
  foreign key(source_beat_revision_id,workspace_id,workpiece_id,beat_id,source_beat_revision)
    references tongs.broll_beat_revisions(id,workspace_id,workpiece_id,beat_id,revision),
  foreign key(previous_revision_id,workspace_id,workpiece_id,beat_id,previous_revision)
    references tongs.broll_prompt_revisions(id,workspace_id,workpiece_id,beat_id,revision),
  check((previous_revision_id is null)=(previous_revision is null)),
  check((revision=1 and previous_revision_id is null) or (revision>1 and previous_revision=revision-1))
);

create table tongs.broll_prompt_sequences (
  workspace_id uuid not null,
  workpiece_id uuid not null,
  beat_id uuid not null,
  current_prompt_revision_id uuid,
  current_prompt_revision bigint not null default 0 check(current_prompt_revision>=0),
  updated_at timestamptz not null default now(),
  primary key(workspace_id,workpiece_id,beat_id),
  foreign key(workpiece_id,workspace_id) references tongs.episodes(id,workspace_id) on delete cascade,
  foreign key(current_prompt_revision_id,workspace_id,workpiece_id,beat_id,current_prompt_revision)
    references tongs.broll_prompt_revisions(id,workspace_id,workpiece_id,beat_id,revision),
  check((current_prompt_revision_id is null and current_prompt_revision=0) or (current_prompt_revision_id is not null and current_prompt_revision>0))
);

create table tongs.broll_candidates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null,
  beat_id uuid not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key(workpiece_id,workspace_id) references tongs.episodes(id,workspace_id) on delete cascade
);

create table tongs.broll_candidate_revisions (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references tongs.broll_candidates(id),
  workspace_id uuid not null,
  workpiece_id uuid not null,
  beat_id uuid not null,
  revision bigint not null check(revision>0),
  previous_revision_id uuid,
  previous_revision bigint,
  prompt_revision_id uuid,
  prompt_revision bigint,
  prompt_content_hash text,
  asset_id uuid not null references tongs.assets(id),
  asset_content_hash text not null check(asset_content_hash~'^[0-9a-f]{64}$'),
  asset_path text not null,
  storage_bucket text not null,
  storage_key text not null,
  mime_type text not null check(mime_type like 'video/%'),
  duration_ms bigint not null check(duration_ms>0),
  width integer not null check(width>0),
  height integer not null check(height>0),
  poster_asset_id uuid references tongs.assets(id),
  source_kind text not null check(source_kind in('generated','upload','external','stock')),
  provider text not null,
  provider_request_id text,
  source_url text,
  license_json jsonb not null check(jsonb_typeof(license_json)='object'),
  provenance_json jsonb not null check(jsonb_typeof(provenance_json)='object'),
  content_hash text not null check(content_hash~'^[0-9a-f]{64}$'),
  immutable_revision_hash text not null check(immutable_revision_hash~'^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(candidate_id,revision),
  unique(id,workspace_id,workpiece_id,beat_id,revision),
  foreign key(prompt_revision_id,workspace_id,workpiece_id,beat_id,prompt_revision)
    references tongs.broll_prompt_revisions(id,workspace_id,workpiece_id,beat_id,revision),
  foreign key(previous_revision_id,workspace_id,workpiece_id,beat_id,previous_revision)
    references tongs.broll_candidate_revisions(id,workspace_id,workpiece_id,beat_id,revision),
  check((previous_revision_id is null)=(previous_revision is null)),
  check((prompt_revision_id is null)=(prompt_revision is null)),
  check((prompt_revision_id is null)=(prompt_content_hash is null)),
  check(source_kind not in('generated') or prompt_revision_id is not null),
  check((revision=1 and previous_revision_id is null) or (revision>1 and previous_revision=revision-1))
);

create table tongs.broll_selections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  workpiece_id uuid not null,
  revision bigint not null check(revision>0),
  previous_selection_id uuid,
  previous_revision bigint,
  plan_revision_id uuid not null,
  plan_revision bigint not null,
  beat_id uuid not null,
  beat_revision_id uuid not null,
  beat_revision bigint not null,
  candidate_revision_id uuid not null,
  candidate_revision bigint not null,
  decision text not null check(decision in('selected','cleared')),
  operation_id text not null,
  operation_fingerprint text not null check(operation_fingerprint~'^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(workspace_id,workpiece_id,revision),
  unique(operation_id),
  foreign key(plan_revision_id,workspace_id,workpiece_id,plan_revision)
    references tongs.broll_plan_revisions(id,workspace_id,workpiece_id,revision),
  foreign key(beat_revision_id,workspace_id,workpiece_id,beat_id,beat_revision)
    references tongs.broll_beat_revisions(id,workspace_id,workpiece_id,beat_id,revision),
  foreign key(candidate_revision_id,workspace_id,workpiece_id,beat_id,candidate_revision)
    references tongs.broll_candidate_revisions(id,workspace_id,workpiece_id,beat_id,revision),
  foreign key(previous_selection_id) references tongs.broll_selections(id),
  check((previous_selection_id is null)=(previous_revision is null)),
  check((revision=1 and previous_selection_id is null) or (revision>1 and previous_revision=revision-1))
);

create table tongs.broll_operation_receipts (
  operation_id text primary key check(operation_id~'^forge:broll:[a-zA-Z0-9._:-]{8,180}$'),
  operation_fingerprint text not null check(operation_fingerprint~'^[0-9a-f]{64}$'),
  operation_type text not null check(operation_type in('plan_commit','prompt_interpretation','prompt_edit','candidate_acquire','selection')),
  state text not null check(state in('pending','provider_or_upload_completed','asset_verified','committed','candidate_committed','selected','failed')),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null,
  beat_id uuid,
  normalized_inputs_json jsonb not null check(jsonb_typeof(normalized_inputs_json)='object'),
  provider_response_json jsonb,
  provider_response_hash text check(provider_response_hash is null or provider_response_hash~'^[0-9a-f]{64}$'),
  verified_asset_id uuid references tongs.assets(id),
  verified_poster_asset_id uuid references tongs.assets(id),
  result_plan_revision_id uuid,
  result_prompt_revision_id uuid,
  result_candidate_revision_id uuid,
  result_selection_id uuid,
  failed_stage text,
  failure_code text,
  failure_message text,
  receipt_json jsonb,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(workpiece_id,workspace_id) references tongs.episodes(id,workspace_id) on delete cascade,
  check((provider_response_json is null)=(provider_response_hash is null)),
  check(state not in('committed','candidate_committed','selected') or receipt_json is not null)
);

create index broll_membership_beat_idx on tongs.broll_plan_beat_membership(workspace_id,workpiece_id,beat_id);
create index broll_candidates_beat_idx on tongs.broll_candidate_revisions(workspace_id,workpiece_id,beat_id,created_at desc);
create index broll_selections_beat_idx on tongs.broll_selections(workspace_id,workpiece_id,beat_id,revision desc);

create or replace function tongs.reject_broll_immutable_mutation() returns trigger
language plpgsql set search_path=pg_catalog,tongs as $$ begin raise exception '% is immutable',tg_table_name using errcode='55000'; end $$;
do $$ declare v_table text; begin foreach v_table in array array['broll_plan_revisions','broll_beat_revisions','broll_plan_beat_membership','broll_prompt_revisions','broll_candidates','broll_candidate_revisions','broll_selections'] loop execute format('create trigger %I before update or delete on tongs.%I for each row execute function tongs.reject_broll_immutable_mutation()',v_table||'_immutable',v_table); end loop; end $$;

create or replace function tongs.guard_broll_operation_receipt() returns trigger language plpgsql set search_path=pg_catalog,tongs as $$
begin
 if tg_op='DELETE' then raise exception 'B-roll operation receipts are durable' using errcode='55000'; end if;
 if old.state in('committed','candidate_committed','selected') then raise exception 'terminal B-roll receipt is immutable' using errcode='55000'; end if;
 if new.operation_id<>old.operation_id or new.operation_fingerprint<>old.operation_fingerprint or new.operation_type<>old.operation_type or new.workspace_id<>old.workspace_id or new.workpiece_id<>old.workpiece_id or new.beat_id is distinct from old.beat_id or new.created_by<>old.created_by or new.created_at<>old.created_at then raise exception 'B-roll operation identity is immutable' using errcode='55000'; end if;
 return new;
end $$;
create trigger broll_operation_receipts_guard before update or delete on tongs.broll_operation_receipts for each row execute function tongs.guard_broll_operation_receipt();

create or replace function tongs.begin_broll_operation(p_workspace_id uuid,p_workpiece_id uuid,p_beat_id uuid,p_operation_type text,p_operation_id text,p_operation_fingerprint text,p_inputs jsonb,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_op tongs.broll_operation_receipts%rowtype;
begin
 if not tongs.has_workspace_role(p_workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id,0));
 select * into v_op from tongs.broll_operation_receipts where operation_id=p_operation_id for update;
 if found then
  if v_op.operation_fingerprint<>p_operation_fingerprint or v_op.workspace_id<>p_workspace_id or v_op.workpiece_id<>p_workpiece_id or v_op.beat_id is distinct from p_beat_id or v_op.operation_type<>p_operation_type then return jsonb_build_object('disposition','operation_identity_conflict'); end if;
  if v_op.state='failed' then update tongs.broll_operation_receipts set state=case when verified_asset_id is not null then 'asset_verified' when provider_response_json is not null then 'provider_or_upload_completed' else 'pending' end,failed_stage=null,failure_code=null,failure_message=null,updated_at=now() where operation_id=p_operation_id returning * into v_op; end if;
  return jsonb_build_object('disposition','replay','operation',to_jsonb(v_op));
 end if;
 insert into tongs.broll_operation_receipts(operation_id,operation_fingerprint,operation_type,state,workspace_id,workpiece_id,beat_id,normalized_inputs_json,created_by)
 values(p_operation_id,p_operation_fingerprint,p_operation_type,'pending',p_workspace_id,p_workpiece_id,p_beat_id,p_inputs,p_actor_id) returning * into v_op;
 return jsonb_build_object('disposition','reserved','operation',to_jsonb(v_op));
end $$;

create or replace function tongs.record_broll_provider_or_upload_result(p_operation_id text,p_operation_fingerprint text,p_result jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_op tongs.broll_operation_receipts%rowtype; v_hash text;
begin
 select * into v_op from tongs.broll_operation_receipts where operation_id=p_operation_id for update;
 if not found then return jsonb_build_object('disposition','operation_not_found'); end if;
 if not tongs.has_workspace_role(v_op.workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501'; end if;
 if v_op.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict'); end if;
 if v_op.state<>'pending' then return jsonb_build_object('disposition','replay','operation',to_jsonb(v_op)); end if;
 v_hash:=encode(extensions.digest(convert_to(p_result::text,'UTF8'),'sha256'),'hex');
 update tongs.broll_operation_receipts set state='provider_or_upload_completed',provider_response_json=p_result,provider_response_hash=v_hash,updated_at=now() where operation_id=p_operation_id returning * into v_op;
 return jsonb_build_object('disposition','result_recorded','operation',to_jsonb(v_op));
end $$;

create or replace function tongs.verify_broll_operation_asset(p_operation_id text,p_operation_fingerprint text,p_asset_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_op tongs.broll_operation_receipts%rowtype; v_asset tongs.assets%rowtype;
begin
 select * into v_op from tongs.broll_operation_receipts where operation_id=p_operation_id for update;
 if not found then return jsonb_build_object('disposition','operation_not_found'); end if;
 if not tongs.has_workspace_role(v_op.workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501'; end if;
 if v_op.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict'); end if;
 if v_op.verified_asset_id is not null then return jsonb_build_object('disposition','replay','operation',to_jsonb(v_op)); end if;
 if v_op.state<>'provider_or_upload_completed' then return jsonb_build_object('disposition','provider_or_upload_result_required'); end if;
 select * into v_asset from tongs.assets where id=p_asset_id and workspace_id=v_op.workspace_id and workpiece_id=v_op.workpiece_id and status='ready' and mime_type like 'video/%' and content_hash is not null and ready_at is not null;
 if not found then return jsonb_build_object('disposition','verified_video_asset_required'); end if;
 update tongs.broll_operation_receipts set state='asset_verified',verified_asset_id=v_asset.id,updated_at=now() where operation_id=p_operation_id returning * into v_op;
 return jsonb_build_object('disposition','asset_verified','operation',to_jsonb(v_op),'asset',to_jsonb(v_asset));
end $$;

create or replace function tongs.verify_broll_operation_poster(p_operation_id text,p_operation_fingerprint text,p_poster_asset_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_op tongs.broll_operation_receipts%rowtype; v_asset tongs.assets%rowtype;
begin
 select * into v_op from tongs.broll_operation_receipts where operation_id=p_operation_id for update;
 if not found then return jsonb_build_object('disposition','operation_not_found'); end if;
 if not tongs.has_workspace_role(v_op.workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501'; end if;
 if v_op.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict'); end if;
 if v_op.verified_poster_asset_id is not null then
  if v_op.verified_poster_asset_id<>p_poster_asset_id then return jsonb_build_object('disposition','poster_asset_conflict'); end if;
  return jsonb_build_object('disposition','replay','operation',to_jsonb(v_op));
 end if;
 if v_op.state<>'asset_verified' then return jsonb_build_object('disposition','video_asset_verification_required'); end if;
 select * into v_asset from tongs.assets where id=p_poster_asset_id and workspace_id=v_op.workspace_id and workpiece_id=v_op.workpiece_id and status='ready' and asset_kind='broll_candidate_poster' and mime_type like 'image/%' and content_hash is not null and ready_at is not null;
 if not found then return jsonb_build_object('disposition','verified_poster_asset_required'); end if;
 update tongs.broll_operation_receipts set verified_poster_asset_id=v_asset.id,updated_at=now() where operation_id=p_operation_id returning * into v_op;
 return jsonb_build_object('disposition','poster_asset_verified','operation',to_jsonb(v_op),'asset',to_jsonb(v_asset));
end $$;

create or replace function tongs.fail_broll_operation(p_operation_id text,p_operation_fingerprint text,p_failed_stage text,p_failure_code text,p_failure_message text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_op tongs.broll_operation_receipts%rowtype;
begin
 select * into v_op from tongs.broll_operation_receipts where operation_id=p_operation_id for update;
 if not found then return jsonb_build_object('disposition','operation_not_found'); end if;
 if not tongs.has_workspace_role(v_op.workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501'; end if;
 if v_op.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict'); end if;
 if v_op.state in('committed','candidate_committed','selected') then return jsonb_build_object('disposition','terminal_operation','operation',to_jsonb(v_op)); end if;
 update tongs.broll_operation_receipts set state='failed',failed_stage=p_failed_stage,failure_code=p_failure_code,failure_message=p_failure_message,updated_at=now() where operation_id=p_operation_id returning * into v_op;
 return jsonb_build_object('disposition','failed','operation',to_jsonb(v_op));
end $$;

create or replace function tongs.commit_broll_plan(p_workspace_id uuid,p_workpiece_id uuid,p_expected_revision_id uuid,p_expected_revision bigint,p_script_approval_id uuid,p_source_context_contract_version text,p_beats jsonb,p_operation_id text,p_operation_fingerprint text,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_seq tongs.broll_plan_sequences%rowtype; v_script tongs.script_approval_revisions%rowtype; v_plan tongs.broll_plan_revisions%rowtype; v_op tongs.broll_operation_receipts%rowtype; v_beat jsonb; v_beat_rev tongs.broll_beat_revisions%rowtype; v_prev tongs.broll_beat_revisions%rowtype; v_beat_id uuid; v_hash text; v_immutable text; v_ordinal int:=0; v_result jsonb;
begin
 if not tongs.has_workspace_role(p_workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501'; end if;
 if jsonb_typeof(p_beats)<>'array' or jsonb_array_length(p_beats)=0 then return jsonb_build_object('disposition','beats_required'); end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id,0));
 select * into v_op from tongs.broll_operation_receipts where operation_id=p_operation_id for update;
 if found then if v_op.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict'); end if; return v_op.receipt_json; end if;
 insert into tongs.broll_plan_sequences(workspace_id,workpiece_id) values(p_workspace_id,p_workpiece_id) on conflict do nothing;
 select * into v_seq from tongs.broll_plan_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id for update;
 if v_seq.current_plan_revision<>p_expected_revision or v_seq.current_plan_revision_id is distinct from p_expected_revision_id then return jsonb_build_object('disposition','plan_revision_conflict','current_revision_id',v_seq.current_plan_revision_id,'current_revision',v_seq.current_plan_revision); end if;
 select * into v_script from tongs.script_approval_revisions where id=p_script_approval_id and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
 if not found then return jsonb_build_object('disposition','script_revision_conflict'); end if;
 v_hash:=encode(extensions.digest(convert_to(jsonb_build_object('script_approval_id',v_script.id,'script_hash',v_script.script_content_hash,'contract',p_source_context_contract_version,'beats',p_beats)::text,'UTF8'),'sha256'),'hex');
 v_immutable:=encode(extensions.digest(convert_to(jsonb_build_object('content_hash',v_hash,'revision',v_seq.current_plan_revision+1,'previous_revision_id',v_seq.current_plan_revision_id,'operation_id',p_operation_id)::text,'UTF8'),'sha256'),'hex');
 insert into tongs.broll_plan_revisions(workspace_id,workpiece_id,revision,previous_revision_id,previous_revision,script_approval_id,script_approval_revision,script_content_hash,source_context_contract_version,content_hash,immutable_revision_hash,created_by)
 values(p_workspace_id,p_workpiece_id,v_seq.current_plan_revision+1,v_seq.current_plan_revision_id,nullif(v_seq.current_plan_revision,0),v_script.id,v_script.approval_revision,v_script.script_content_hash,p_source_context_contract_version,v_hash,v_immutable,p_actor_id) returning * into v_plan;
 for v_beat in select value from jsonb_array_elements(p_beats) loop
  v_ordinal:=v_ordinal+1; v_beat_id:=coalesce(nullif(v_beat->>'beat_id','')::uuid,gen_random_uuid());
  select * into v_prev from tongs.broll_beat_revisions where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and beat_id=v_beat_id order by revision desc limit 1;
  v_hash:=encode(extensions.digest(convert_to(v_beat::text,'UTF8'),'sha256'),'hex');
  v_immutable:=encode(extensions.digest(convert_to(jsonb_build_object('content_hash',v_hash,'plan_revision_id',v_plan.id,'beat_id',v_beat_id,'revision',coalesce(v_prev.revision,0)+1)::text,'UTF8'),'sha256'),'hex');
  insert into tongs.broll_beat_revisions(workspace_id,workpiece_id,beat_id,revision,previous_revision_id,previous_revision,source_plan_revision_id,source_plan_revision,script_approval_id,script_approval_revision,context_before,context_focus,context_after,canonical_anchor_assessment,narrative_purpose,placement_hint,duration_target_ms,shot_type,motion_intent,mood_pacing,asset_category,trim_guidance_json,content_hash,immutable_revision_hash,created_by)
  values(p_workspace_id,p_workpiece_id,v_beat_id,coalesce(v_prev.revision,0)+1,v_prev.id,v_prev.revision,v_plan.id,v_plan.revision,v_script.id,v_script.approval_revision,coalesce(v_beat->>'context_before',''),v_beat->>'context_focus',coalesce(v_beat->>'context_after',''),coalesce(v_beat->'canonical_anchor_assessment','{}'),v_beat->>'narrative_purpose',v_beat->>'placement_hint',coalesce((v_beat->>'duration_target_ms')::bigint,4000),v_beat->>'shot_type',v_beat->>'motion_intent',v_beat->>'mood_pacing',v_beat->>'asset_category',coalesce(v_beat->'trim_guidance','{}'),v_hash,v_immutable,p_actor_id) returning * into v_beat_rev;
  insert into tongs.broll_plan_beat_membership(plan_revision_id,workspace_id,workpiece_id,plan_revision,ordinal,beat_id,beat_revision_id,beat_revision) values(v_plan.id,p_workspace_id,p_workpiece_id,v_plan.revision,v_ordinal,v_beat_id,v_beat_rev.id,v_beat_rev.revision);
 end loop;
 update tongs.broll_plan_sequences set current_plan_revision_id=v_plan.id,current_plan_revision=v_plan.revision,updated_at=now() where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
 v_result:=jsonb_build_object('disposition','committed','plan_revision',to_jsonb(v_plan));
 insert into tongs.broll_operation_receipts(operation_id,operation_fingerprint,operation_type,state,workspace_id,workpiece_id,normalized_inputs_json,result_plan_revision_id,receipt_json,created_by) values(p_operation_id,p_operation_fingerprint,'plan_commit','committed',p_workspace_id,p_workpiece_id,jsonb_build_object('beats',p_beats),v_plan.id,v_result,p_actor_id);
 return v_result;
end $$;

create or replace function tongs.commit_broll_candidate(p_operation_id text,p_operation_fingerprint text,p_prompt_revision_id uuid,p_source_kind text,p_license_json jsonb,p_provenance_json jsonb,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_op tongs.broll_operation_receipts%rowtype; v_asset tongs.assets%rowtype; v_prompt tongs.broll_prompt_revisions%rowtype; v_candidate tongs.broll_candidates%rowtype; v_rev tongs.broll_candidate_revisions%rowtype; v_hash text; v_immutable text; v_result jsonb;
begin
 select * into v_op from tongs.broll_operation_receipts where operation_id=p_operation_id for update;
 if not found then return jsonb_build_object('disposition','operation_not_found'); end if;
 if not tongs.has_workspace_role(v_op.workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501'; end if;
 if v_op.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict'); end if;
 if v_op.state='candidate_committed' then return v_op.receipt_json; end if;
 if v_op.state<>'asset_verified' then return jsonb_build_object('disposition','asset_verification_required'); end if;
 select * into v_asset from tongs.assets where id=v_op.verified_asset_id;
 if p_source_kind in('generated') and p_prompt_revision_id is null then return jsonb_build_object('disposition','prompt_revision_required'); end if;
 if p_prompt_revision_id is not null then select * into v_prompt from tongs.broll_prompt_revisions where id=p_prompt_revision_id and workspace_id=v_op.workspace_id and workpiece_id=v_op.workpiece_id and beat_id=v_op.beat_id; if not found then return jsonb_build_object('disposition','prompt_revision_conflict'); end if; end if;
 insert into tongs.broll_candidates(workspace_id,workpiece_id,beat_id,created_by) values(v_op.workspace_id,v_op.workpiece_id,v_op.beat_id,p_actor_id) returning * into v_candidate;
 v_hash:=encode(extensions.digest(convert_to(jsonb_build_object('asset_id',v_asset.id,'asset_hash',v_asset.content_hash,'prompt_hash',v_prompt.content_hash,'source_kind',p_source_kind,'license',p_license_json,'provenance',p_provenance_json)::text,'UTF8'),'sha256'),'hex');
 v_immutable:=encode(extensions.digest(convert_to(jsonb_build_object('candidate_id',v_candidate.id,'content_hash',v_hash,'revision',1,'operation_id',p_operation_id)::text,'UTF8'),'sha256'),'hex');
 insert into tongs.broll_candidate_revisions(candidate_id,workspace_id,workpiece_id,beat_id,revision,prompt_revision_id,prompt_revision,prompt_content_hash,asset_id,asset_content_hash,asset_path,storage_bucket,storage_key,mime_type,duration_ms,width,height,poster_asset_id,source_kind,provider,provider_request_id,source_url,license_json,provenance_json,content_hash,immutable_revision_hash,created_by)
 values(v_candidate.id,v_op.workspace_id,v_op.workpiece_id,v_op.beat_id,1,v_prompt.id,v_prompt.revision,v_prompt.content_hash,v_asset.id,v_asset.content_hash,v_asset.path,v_asset.storage_bucket,v_asset.storage_key,v_asset.mime_type,coalesce((v_asset.metadata_json->>'duration_ms')::bigint,1),coalesce(v_asset.width,1),coalesce(v_asset.height,1),v_op.verified_poster_asset_id,p_source_kind,v_asset.provider,v_asset.provider_request_id,p_provenance_json->>'source_url',p_license_json,p_provenance_json,v_hash,v_immutable,p_actor_id) returning * into v_rev;
 v_result:=jsonb_build_object('disposition','committed','candidate_revision',to_jsonb(v_rev));
 update tongs.broll_operation_receipts set state='candidate_committed',result_candidate_revision_id=v_rev.id,receipt_json=v_result,updated_at=now() where operation_id=p_operation_id;
 return v_result;
end $$;

create or replace function tongs.commit_broll_prompt_interpretation(p_operation_id text,p_operation_fingerprint text,p_source_beat_revision_id uuid,p_motion_brief jsonb,p_final_prompt text,p_interpretation_contract_version text,p_validator_version text,p_synthesis_contract_version text,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_op tongs.broll_operation_receipts%rowtype; v_beat tongs.broll_beat_revisions%rowtype; v_seq tongs.broll_prompt_sequences%rowtype; v_prompt tongs.broll_prompt_revisions%rowtype; v_hash text; v_immutable text; v_result jsonb; v_required text;
begin
 select * into v_op from tongs.broll_operation_receipts where operation_id=p_operation_id for update;
 if not found then return jsonb_build_object('disposition','operation_not_found'); end if;
 if not tongs.has_workspace_role(v_op.workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501'; end if;
 if v_op.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict'); end if;
 if v_op.state='committed' then return v_op.receipt_json; end if;
 if v_op.operation_type<>'prompt_interpretation' or v_op.state<>'provider_or_upload_completed' then return jsonb_build_object('disposition','provider_response_required'); end if;
 foreach v_required in array array['visible_subjects','action_across_time','camera_behavior','start_state','end_state','duration','setting','mood_pacing','continuity','must_include','exclusions','loopability'] loop
  if not p_motion_brief ? v_required or p_motion_brief->v_required in('null'::jsonb,'""'::jsonb,'[]'::jsonb,'{}'::jsonb) then return jsonb_build_object('disposition','interpretation_incomplete','missing_field',v_required); end if;
 end loop;
 select * into v_beat from tongs.broll_beat_revisions where id=p_source_beat_revision_id and workspace_id=v_op.workspace_id and workpiece_id=v_op.workpiece_id and beat_id=v_op.beat_id;
 if not found then return jsonb_build_object('disposition','beat_revision_conflict'); end if;
 insert into tongs.broll_prompt_sequences(workspace_id,workpiece_id,beat_id) values(v_op.workspace_id,v_op.workpiece_id,v_op.beat_id) on conflict do nothing;
 select * into v_seq from tongs.broll_prompt_sequences where workspace_id=v_op.workspace_id and workpiece_id=v_op.workpiece_id and beat_id=v_op.beat_id for update;
 if v_seq.current_prompt_revision<>coalesce((v_op.normalized_inputs_json->>'expected_prompt_revision')::bigint,0) or v_seq.current_prompt_revision_id is distinct from nullif(v_op.normalized_inputs_json->>'expected_prompt_revision_id','')::uuid then return jsonb_build_object('disposition','prompt_revision_conflict','current_revision_id',v_seq.current_prompt_revision_id,'current_revision',v_seq.current_prompt_revision); end if;
 v_hash:=encode(extensions.digest(convert_to(jsonb_build_object('beat_revision_id',v_beat.id,'motion_brief',p_motion_brief,'final_prompt',p_final_prompt,'contracts',jsonb_build_object('interpretation',p_interpretation_contract_version,'validator',p_validator_version,'synthesis',p_synthesis_contract_version))::text,'UTF8'),'sha256'),'hex');
 v_immutable:=encode(extensions.digest(convert_to(jsonb_build_object('content_hash',v_hash,'revision',v_seq.current_prompt_revision+1,'previous_revision_id',v_seq.current_prompt_revision_id,'operation_id',p_operation_id)::text,'UTF8'),'sha256'),'hex');
 insert into tongs.broll_prompt_revisions(workspace_id,workpiece_id,beat_id,revision,previous_revision_id,previous_revision,source_beat_revision_id,source_beat_revision,motion_brief_json,final_prompt,prompt_source,interpretation_contract_version,validator_version,synthesis_contract_version,provider_response_json,content_hash,immutable_revision_hash,created_by)
 values(v_op.workspace_id,v_op.workpiece_id,v_op.beat_id,v_seq.current_prompt_revision+1,v_seq.current_prompt_revision_id,nullif(v_seq.current_prompt_revision,0),v_beat.id,v_beat.revision,p_motion_brief,p_final_prompt,'ai_derived',p_interpretation_contract_version,p_validator_version,p_synthesis_contract_version,v_op.provider_response_json,v_hash,v_immutable,p_actor_id) returning * into v_prompt;
 update tongs.broll_prompt_sequences set current_prompt_revision_id=v_prompt.id,current_prompt_revision=v_prompt.revision,updated_at=now() where workspace_id=v_op.workspace_id and workpiece_id=v_op.workpiece_id and beat_id=v_op.beat_id;
 v_result:=jsonb_build_object('disposition','committed','prompt_revision',to_jsonb(v_prompt),'provider_response_hash',v_op.provider_response_hash);
 update tongs.broll_operation_receipts set state='committed',result_prompt_revision_id=v_prompt.id,receipt_json=v_result,updated_at=now() where operation_id=p_operation_id;
 return v_result;
end $$;

create or replace function tongs.commit_broll_prompt_creator_edit(p_workspace_id uuid,p_workpiece_id uuid,p_beat_id uuid,p_expected_prompt_revision_id uuid,p_expected_prompt_revision bigint,p_final_prompt text,p_operation_id text,p_operation_fingerprint text,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_seq tongs.broll_prompt_sequences%rowtype; v_current tongs.broll_prompt_revisions%rowtype; v_prompt tongs.broll_prompt_revisions%rowtype; v_op tongs.broll_operation_receipts%rowtype; v_hash text; v_immutable text; v_result jsonb;
begin
 if not tongs.has_workspace_role(p_workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id,0));
 select * into v_op from tongs.broll_operation_receipts where operation_id=p_operation_id for update;
 if found then if v_op.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict'); end if; return v_op.receipt_json; end if;
 select * into v_seq from tongs.broll_prompt_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and beat_id=p_beat_id for update;
 if not found or v_seq.current_prompt_revision_id is distinct from p_expected_prompt_revision_id or v_seq.current_prompt_revision<>p_expected_prompt_revision then return jsonb_build_object('disposition','prompt_revision_conflict','current_revision_id',v_seq.current_prompt_revision_id,'current_revision',v_seq.current_prompt_revision); end if;
 select * into v_current from tongs.broll_prompt_revisions where id=v_seq.current_prompt_revision_id;
 v_hash:=encode(extensions.digest(convert_to(jsonb_build_object('prior_content_hash',v_current.content_hash,'final_prompt',p_final_prompt,'prompt_source','creator_edited')::text,'UTF8'),'sha256'),'hex');
 v_immutable:=encode(extensions.digest(convert_to(jsonb_build_object('content_hash',v_hash,'revision',v_current.revision+1,'previous_revision_id',v_current.id,'operation_id',p_operation_id)::text,'UTF8'),'sha256'),'hex');
 insert into tongs.broll_prompt_revisions(workspace_id,workpiece_id,beat_id,revision,previous_revision_id,previous_revision,source_beat_revision_id,source_beat_revision,motion_brief_json,final_prompt,prompt_source,interpretation_contract_version,validator_version,synthesis_contract_version,provider_response_json,content_hash,immutable_revision_hash,created_by)
 select workspace_id,workpiece_id,beat_id,revision+1,id,revision,source_beat_revision_id,source_beat_revision,motion_brief_json,p_final_prompt,'creator_edited',interpretation_contract_version,validator_version,synthesis_contract_version,provider_response_json,v_hash,v_immutable,p_actor_id from tongs.broll_prompt_revisions where id=v_current.id returning * into v_prompt;
 update tongs.broll_prompt_sequences set current_prompt_revision_id=v_prompt.id,current_prompt_revision=v_prompt.revision,updated_at=now() where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and beat_id=p_beat_id;
 v_result:=jsonb_build_object('disposition','committed','prompt_revision',to_jsonb(v_prompt));
 insert into tongs.broll_operation_receipts(operation_id,operation_fingerprint,operation_type,state,workspace_id,workpiece_id,beat_id,normalized_inputs_json,result_prompt_revision_id,receipt_json,created_by) values(p_operation_id,p_operation_fingerprint,'prompt_edit','committed',p_workspace_id,p_workpiece_id,p_beat_id,jsonb_build_object('expected_prompt_revision_id',p_expected_prompt_revision_id,'expected_prompt_revision',p_expected_prompt_revision,'final_prompt',p_final_prompt),v_prompt.id,v_result,p_actor_id);
 return v_result;
end $$;

create or replace function tongs.select_broll_candidate(p_workspace_id uuid,p_workpiece_id uuid,p_beat_id uuid,p_candidate_revision_id uuid,p_expected_plan_revision_id uuid,p_expected_plan_revision bigint,p_expected_selection_revision bigint,p_operation_id text,p_operation_fingerprint text,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_seq tongs.broll_plan_sequences%rowtype; v_member tongs.broll_plan_beat_membership%rowtype; v_candidate tongs.broll_candidate_revisions%rowtype; v_previous tongs.broll_selections%rowtype; v_selection tongs.broll_selections%rowtype; v_op tongs.broll_operation_receipts%rowtype; v_result jsonb;
begin
 if not tongs.has_workspace_role(p_workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id,0));
 select * into v_op from tongs.broll_operation_receipts where operation_id=p_operation_id for update;
 if found then if v_op.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict'); end if; return v_op.receipt_json; end if;
 select * into v_seq from tongs.broll_plan_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id for update;
 if not found or v_seq.current_plan_revision_id is distinct from p_expected_plan_revision_id or v_seq.current_plan_revision<>p_expected_plan_revision then return jsonb_build_object('disposition','plan_revision_conflict','current_revision_id',v_seq.current_plan_revision_id,'current_revision',v_seq.current_plan_revision); end if;
 if v_seq.current_selection_revision<>p_expected_selection_revision then return jsonb_build_object('disposition','selection_revision_conflict','current_selection_revision',v_seq.current_selection_revision); end if;
 select * into v_member from tongs.broll_plan_beat_membership where plan_revision_id=v_seq.current_plan_revision_id and beat_id=p_beat_id;
 if not found then return jsonb_build_object('disposition','beat_not_current'); end if;
 select * into v_candidate from tongs.broll_candidate_revisions where id=p_candidate_revision_id and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and beat_id=p_beat_id;
 if not found then return jsonb_build_object('disposition','candidate_not_attached'); end if;
 select * into v_previous from tongs.broll_selections where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id order by revision desc limit 1;
 insert into tongs.broll_selections(workspace_id,workpiece_id,revision,previous_selection_id,previous_revision,plan_revision_id,plan_revision,beat_id,beat_revision_id,beat_revision,candidate_revision_id,candidate_revision,decision,operation_id,operation_fingerprint,created_by)
 values(p_workspace_id,p_workpiece_id,v_seq.current_selection_revision+1,v_previous.id,v_previous.revision,v_seq.current_plan_revision_id,v_seq.current_plan_revision,p_beat_id,v_member.beat_revision_id,v_member.beat_revision,v_candidate.id,v_candidate.revision,'selected',p_operation_id,p_operation_fingerprint,p_actor_id) returning * into v_selection;
 update tongs.broll_plan_sequences set current_selection_revision=v_selection.revision,updated_at=now() where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
 v_result:=jsonb_build_object('disposition','committed','selection',to_jsonb(v_selection));
 insert into tongs.broll_operation_receipts(operation_id,operation_fingerprint,operation_type,state,workspace_id,workpiece_id,beat_id,normalized_inputs_json,result_selection_id,receipt_json,created_by) values(p_operation_id,p_operation_fingerprint,'selection','selected',p_workspace_id,p_workpiece_id,p_beat_id,jsonb_build_object('candidate_revision_id',p_candidate_revision_id),v_selection.id,v_result,p_actor_id);
 return v_result;
end $$;

create or replace function tongs.read_current_broll_plan(p_workspace_id uuid,p_workpiece_id uuid) returns jsonb language sql stable security definer set search_path=pg_catalog,tongs as $$
select case when not tongs.has_workspace_role(p_workspace_id,'viewer') then null else (
 select jsonb_build_object('sequence',to_jsonb(s),'plan_revision',to_jsonb(p),'beats',coalesce((select jsonb_agg(jsonb_build_object('membership',to_jsonb(m),'beat_revision',to_jsonb(b),'prompt_revision',to_jsonb(pr),'selected_candidate_revision',to_jsonb(cr)) order by m.ordinal)
 from tongs.broll_plan_beat_membership m join tongs.broll_beat_revisions b on b.id=m.beat_revision_id
 left join tongs.broll_prompt_sequences ps on ps.workspace_id=m.workspace_id and ps.workpiece_id=m.workpiece_id and ps.beat_id=m.beat_id
 left join tongs.broll_prompt_revisions pr on pr.id=ps.current_prompt_revision_id
 left join lateral (select sel.* from tongs.broll_selections sel where sel.workspace_id=m.workspace_id and sel.workpiece_id=m.workpiece_id and sel.beat_id=m.beat_id and sel.plan_revision_id=m.plan_revision_id order by sel.revision desc limit 1) sel on true
 left join tongs.broll_candidate_revisions cr on cr.id=sel.candidate_revision_id where m.plan_revision_id=s.current_plan_revision_id),'[]'::jsonb))
 from tongs.broll_plan_sequences s left join tongs.broll_plan_revisions p on p.id=s.current_plan_revision_id where s.workspace_id=p_workspace_id and s.workpiece_id=p_workpiece_id) end
$$;
create or replace function tongs.read_broll_operation_receipt(p_workspace_id uuid,p_operation_id text) returns jsonb language sql stable security definer set search_path=pg_catalog,tongs as $$ select case when not tongs.has_workspace_role(p_workspace_id,'viewer') then null else (select to_jsonb(o) from tongs.broll_operation_receipts o where o.workspace_id=p_workspace_id and o.operation_id=p_operation_id) end $$;

do $$ declare v_table text; begin foreach v_table in array array['broll_plan_revisions','broll_plan_sequences','broll_beat_revisions','broll_plan_beat_membership','broll_prompt_revisions','broll_prompt_sequences','broll_candidates','broll_candidate_revisions','broll_selections','broll_operation_receipts'] loop execute format('alter table tongs.%I enable row level security',v_table); execute format('create policy %I on tongs.%I for select to authenticated using(tongs.has_workspace_role(workspace_id,''viewer''))',v_table||'_viewer',v_table); execute format('revoke all on tongs.%I from public,anon,authenticated',v_table); execute format('grant select on tongs.%I to authenticated',v_table); end loop; end $$;

revoke all on function tongs.begin_broll_operation(uuid,uuid,uuid,text,text,text,jsonb,uuid),tongs.record_broll_provider_or_upload_result(text,text,jsonb),tongs.verify_broll_operation_asset(text,text,uuid),tongs.verify_broll_operation_poster(text,text,uuid),tongs.fail_broll_operation(text,text,text,text,text),tongs.commit_broll_plan(uuid,uuid,uuid,bigint,uuid,text,jsonb,text,text,uuid),tongs.commit_broll_prompt_interpretation(text,text,uuid,jsonb,text,text,text,text,uuid),tongs.commit_broll_prompt_creator_edit(uuid,uuid,uuid,uuid,bigint,text,text,text,uuid),tongs.commit_broll_candidate(text,text,uuid,text,jsonb,jsonb,uuid),tongs.select_broll_candidate(uuid,uuid,uuid,uuid,uuid,bigint,bigint,text,text,uuid) from public,anon,authenticated;
grant execute on function tongs.begin_broll_operation(uuid,uuid,uuid,text,text,text,jsonb,uuid),tongs.record_broll_provider_or_upload_result(text,text,jsonb),tongs.verify_broll_operation_asset(text,text,uuid),tongs.verify_broll_operation_poster(text,text,uuid),tongs.fail_broll_operation(text,text,text,text,text),tongs.commit_broll_plan(uuid,uuid,uuid,bigint,uuid,text,jsonb,text,text,uuid),tongs.commit_broll_prompt_interpretation(text,text,uuid,jsonb,text,text,text,text,uuid),tongs.commit_broll_prompt_creator_edit(uuid,uuid,uuid,uuid,bigint,text,text,text,uuid),tongs.commit_broll_candidate(text,text,uuid,text,jsonb,jsonb,uuid),tongs.select_broll_candidate(uuid,uuid,uuid,uuid,uuid,bigint,bigint,text,text,uuid) to authenticated,service_role;
grant execute on function tongs.read_current_broll_plan(uuid,uuid),tongs.read_broll_operation_receipt(uuid,text) to authenticated,service_role;

commit;
