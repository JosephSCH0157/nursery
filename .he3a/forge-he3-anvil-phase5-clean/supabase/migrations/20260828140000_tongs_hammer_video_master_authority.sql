begin;

alter table tongs.assets drop constraint assets_asset_kind_check;
alter table tongs.assets add constraint assets_asset_kind_check check(asset_kind in(
  'thumbnail_image','thumbnail_composite','image_map_json','image_map_candidate_image',
  'broll_candidate_video','broll_candidate_poster','reference_clip_video','reference_clip_poster',
  'reference_visual_image','source_desk_audio','source_desk_video','hammer_audio_master','hammer_video_master'
));
alter table tongs.assets drop constraint assets_kind_shape_check;
alter table tongs.assets add constraint assets_kind_shape_check check(
  (asset_kind in('thumbnail_image','thumbnail_composite','broll_candidate_poster','reference_clip_poster','reference_visual_image') and mime_type like'image/%') or
  (asset_kind='image_map_json' and mime_type='application/json' and prompt is null) or
  (asset_kind='image_map_candidate_image' and mime_type like'image/%' and(prompt is not null or provider='creator_upload')) or
  (asset_kind in('broll_candidate_video','reference_clip_video','source_desk_video','hammer_video_master') and mime_type like'video/%') or
  (asset_kind in('source_desk_audio','hammer_audio_master') and mime_type like'audio/%')
);

alter table tongs.workpiece_jobs drop constraint workpiece_jobs_job_type_check;
alter table tongs.workpiece_jobs add constraint workpiece_jobs_job_type_check check(
  job_type in ('hammer_transcript_prep','hammer_transcript_regeneration','hammer_final_video_render')
);

create table tongs.hammer_video_render_operations(
  operation_id text primary key,
  operation_fingerprint text not null check(operation_fingerprint~'^[0-9a-f]{64}$'),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null,
  recording_revision_id uuid not null references tongs.recording_revisions(id) on delete restrict,
  composition_revision bigint not null check(composition_revision>0),
  composition_fingerprint text not null,
  render_plan_fingerprint text not null,
  background_effect_fingerprint text null,
  replacement_asset_id uuid null references tongs.assets(id) on delete restrict,
  audio_master_asset_id uuid not null references tongs.assets(id) on delete restrict,
  renderer_version text not null,
  output_profile_id text not null,
  segmentation_authority_json jsonb null,
  state text not null default 'pending' check(state in('pending','rendering','completed','failed','outcome_unknown','cancelled')),
  output_asset_id uuid null references tongs.assets(id) on delete restrict,
  acknowledged_result_fingerprint text null,
  render_evidence_json jsonb null,
  receipt_json jsonb null,
  failure_code text null,
  failure_message text null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(operation_id,operation_fingerprint),
  foreign key(workpiece_id,workspace_id) references tongs.episodes(id,workspace_id) on delete cascade,
  check((state='completed')=(output_asset_id is not null and receipt_json is not null and acknowledged_result_fingerprint is not null)),
  check(background_effect_fingerprint is null or segmentation_authority_json is not null)
);

create table tongs.hammer_video_render_attempts(
  attempt_id uuid primary key default gen_random_uuid(),
  operation_id text not null references tongs.hammer_video_render_operations(operation_id) on delete cascade,
  attempt_number bigint not null check(attempt_number>0),
  state text not null check(state in('reserved','running','completed','failed','outcome_unknown','cancelled')),
  lease_owner text null,
  lease_expires_at timestamptz null,
  progress numeric not null default 0 check(progress>=0 and progress<=1),
  provider_evidence_json jsonb null,
  failure_code text null,
  failure_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(operation_id,attempt_number)
);

create unique index hammer_video_render_completed_identity_idx on tongs.hammer_video_render_operations(
  recording_revision_id,composition_revision,composition_fingerprint,render_plan_fingerprint,output_profile_id
) where state='completed';
create unique index assets_hammer_video_master_operation_idx on tongs.assets(operation_id)
  where asset_kind='hammer_video_master' and operation_id is not null;

alter table tongs.hammer_video_render_operations enable row level security;
alter table tongs.hammer_video_render_attempts enable row level security;
create policy hammer_video_render_operations_select_workspace on tongs.hammer_video_render_operations
  for select to authenticated using(tongs.has_workspace_role(workspace_id,'viewer'));
create policy hammer_video_render_attempts_select_workspace on tongs.hammer_video_render_attempts
  for select to authenticated using(exists(
    select 1 from tongs.hammer_video_render_operations o
    where o.operation_id=hammer_video_render_attempts.operation_id and tongs.has_workspace_role(o.workspace_id,'viewer')
  ));
revoke insert,update,delete on tongs.hammer_video_render_operations,tongs.hammer_video_render_attempts from authenticated;
grant select on tongs.hammer_video_render_operations,tongs.hammer_video_render_attempts to authenticated;
grant all on tongs.hammer_video_render_operations,tongs.hammer_video_render_attempts to service_role;

create or replace function tongs.begin_hammer_video_render(
  p_operation_id text,p_operation_fingerprint text,p_workspace_id uuid,p_workpiece_id uuid,
  p_recording_revision_id uuid,p_composition_revision bigint,p_composition_fingerprint text,
  p_render_plan_fingerprint text,p_background_effect_fingerprint text,p_audio_master_asset_id uuid,
  p_replacement_asset_id uuid,p_renderer_version text,p_output_profile_id text,p_segmentation_authority jsonb,p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare op tongs.hammer_video_render_operations%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'Hammer video render begin requires service authority' using errcode='42501'; end if;
  if p_actor_id is null or not exists(select 1 from tongs.episodes where id=p_workpiece_id and workspace_id=p_workspace_id) then raise exception 'Hammer video render relationship mismatch' using errcode='22023'; end if;
  if not exists(select 1 from tongs.recording_revisions where id=p_recording_revision_id and workpiece_id=p_workpiece_id) then raise exception 'Hammer recording revision mismatch' using errcode='22023'; end if;
  if not exists(select 1 from tongs.assets where id=p_audio_master_asset_id and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and asset_kind='hammer_audio_master' and status='ready') then raise exception 'Hammer audio master relationship mismatch' using errcode='22023'; end if;
  if p_replacement_asset_id is not null and not exists(select 1 from tongs.assets where id=p_replacement_asset_id and workspace_id=p_workspace_id and (workpiece_id=p_workpiece_id or asset_scope='workspace') and mime_type like'image/%' and status='ready') then raise exception 'Hammer replacement asset relationship mismatch' using errcode='22023'; end if;
  if p_background_effect_fingerprint is not null and (p_segmentation_authority is null or p_segmentation_authority->>'failure_policy'<>'fail_closed') then raise exception 'Hammer segmentation authority missing' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id,0));
  select * into op from tongs.hammer_video_render_operations where operation_id=p_operation_id;
  if found then
    if op.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict'); end if;
    return jsonb_build_object('disposition','replay','operation',to_jsonb(op));
  end if;
  insert into tongs.hammer_video_render_operations(operation_id,operation_fingerprint,workspace_id,workpiece_id,recording_revision_id,composition_revision,composition_fingerprint,render_plan_fingerprint,background_effect_fingerprint,audio_master_asset_id,replacement_asset_id,renderer_version,output_profile_id,segmentation_authority_json,state,created_by)
  values(p_operation_id,p_operation_fingerprint,p_workspace_id,p_workpiece_id,p_recording_revision_id,p_composition_revision,p_composition_fingerprint,p_render_plan_fingerprint,p_background_effect_fingerprint,p_audio_master_asset_id,p_replacement_asset_id,p_renderer_version,p_output_profile_id,p_segmentation_authority,'pending',p_actor_id)
  returning * into op;
  return jsonb_build_object('disposition','started','operation',to_jsonb(op));
end$$;

create or replace function tongs.reserve_hammer_video_render_attempt(p_operation_id text,p_operation_fingerprint text,p_lease_owner text,p_lease_seconds integer default 300)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare op tongs.hammer_video_render_operations%rowtype; a tongs.hammer_video_render_attempts%rowtype; n bigint;
begin
  if auth.role()<>'service_role' then raise exception 'Hammer video render attempt requires service authority' using errcode='42501'; end if;
  select * into op from tongs.hammer_video_render_operations where operation_id=p_operation_id for update;
  if not found then return jsonb_build_object('disposition','operation_not_found'); end if;
  if op.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict'); end if;
  if op.state not in('pending','failed') then return jsonb_build_object('disposition','operation_not_reservable','state',op.state); end if;
  if exists(select 1 from tongs.hammer_video_render_attempts where operation_id=p_operation_id and state in('reserved','running') and lease_expires_at>now()) then return jsonb_build_object('disposition','attempt_already_active'); end if;
  select coalesce(max(attempt_number),0)+1 into n from tongs.hammer_video_render_attempts where operation_id=p_operation_id;
  insert into tongs.hammer_video_render_attempts(operation_id,attempt_number,state,lease_owner,lease_expires_at)
  values(p_operation_id,n,'reserved',p_lease_owner,now()+make_interval(secs=>greatest(30,p_lease_seconds))) returning * into a;
  update tongs.hammer_video_render_operations set state='rendering',updated_at=now() where operation_id=p_operation_id;
  return jsonb_build_object('disposition','reserved','attempt',to_jsonb(a));
end$$;

create or replace function tongs.commit_hammer_video_master(
  p_operation_id text,p_operation_fingerprint text,p_attempt_id uuid,p_path text,p_mime_type text,p_byte_size bigint,
  p_content_hash text,p_storage_bucket text,p_storage_key text,p_duration_ms bigint,p_width integer,p_height integer,
  p_fps numeric,p_render_evidence jsonb,p_acknowledged_result_fingerprint text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare op tongs.hammer_video_render_operations%rowtype; a tongs.assets%rowtype; receipt jsonb;
begin
  if auth.role()<>'service_role' then raise exception 'Hammer video master commit requires service authority' using errcode='42501'; end if;
  select * into op from tongs.hammer_video_render_operations where operation_id=p_operation_id for update;
  if not found then return jsonb_build_object('disposition','operation_not_found'); end if;
  if op.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict'); end if;
  if op.state='completed' then return op.receipt_json; end if;
  if op.state<>'rendering' or not exists(select 1 from tongs.hammer_video_render_attempts where attempt_id=p_attempt_id and operation_id=p_operation_id and state in('reserved','running')) then return jsonb_build_object('disposition','operation_not_committable','state',op.state); end if;
  if p_mime_type not like'video/%' or p_byte_size<=0 or p_duration_ms<=0 or p_width<=0 or p_height<=0 or p_fps<=0 or p_content_hash!~'^[0-9a-f]{64}$' or coalesce(p_acknowledged_result_fingerprint,'')='' then return jsonb_build_object('disposition','invalid_verified_video_evidence'); end if;
  select * into a from tongs.assets where operation_id=p_operation_id and asset_kind='hammer_video_master' for update;
  if found then
    if a.operation_fingerprint<>p_operation_fingerprint or a.content_hash<>p_content_hash or a.storage_bucket<>p_storage_bucket or a.storage_key<>p_storage_key or a.bytes<>p_byte_size then return jsonb_build_object('disposition','asset_replay_conflict'); end if;
  else
    insert into tongs.assets(workspace_id,workpiece_id,asset_scope,path,mime_type,bytes,storage_bucket,storage_key,provider,request_id,created_by,asset_kind,status,metadata_json,operation_id,operation_fingerprint,content_hash,provenance_classification,provenance_json,ready_at)
    values(op.workspace_id,op.workpiece_id,'workpiece',p_path,p_mime_type,p_byte_size,p_storage_bucket,p_storage_key,'hammer-video-renderer',p_operation_id,op.created_by,'hammer_video_master','ready',jsonb_build_object('duration_ms',p_duration_ms,'width',p_width,'height',p_height,'fps',p_fps,'recording_revision_id',op.recording_revision_id,'composition_revision',op.composition_revision,'composition_fingerprint',op.composition_fingerprint,'render_plan_fingerprint',op.render_plan_fingerprint,'background_effect_fingerprint',op.background_effect_fingerprint,'audio_master_asset_id',op.audio_master_asset_id,'replacement_asset_id',op.replacement_asset_id,'renderer_version',op.renderer_version,'output_profile_id',op.output_profile_id),p_operation_id,p_operation_fingerprint,p_content_hash,'canonical_native',coalesce(p_render_evidence,'{}'::jsonb),now()) returning * into a;
  end if;
  receipt:=jsonb_build_object('disposition','committed','operation_id',op.operation_id,'operation_fingerprint',op.operation_fingerprint,'attempt_id',p_attempt_id,'asset',to_jsonb(a),'render_evidence',p_render_evidence,'acknowledged_result_fingerprint',p_acknowledged_result_fingerprint);
  update tongs.hammer_video_render_attempts set state='completed',progress=1,provider_evidence_json=p_render_evidence,updated_at=now() where attempt_id=p_attempt_id;
  update tongs.hammer_video_render_operations set state='completed',output_asset_id=a.id,acknowledged_result_fingerprint=p_acknowledged_result_fingerprint,render_evidence_json=p_render_evidence,receipt_json=receipt,failure_code=null,failure_message=null,updated_at=now() where operation_id=p_operation_id;
  return receipt;
end$$;

create or replace function tongs.fail_hammer_video_render(p_operation_id text,p_operation_fingerprint text,p_attempt_id uuid,p_failure_code text,p_failure_message text,p_outcome_unknown boolean default false)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare op tongs.hammer_video_render_operations%rowtype; attempt_row record; next_state text:=case when p_outcome_unknown then'outcome_unknown'else'failed'end;
begin
  if auth.role()<>'service_role' then raise exception 'Hammer video render failure requires service authority' using errcode='42501'; end if;
  update tongs.hammer_video_render_attempts set state=next_state,failure_code=p_failure_code,failure_message=p_failure_message,updated_at=now()
  where attempt_id=p_attempt_id and operation_id=p_operation_id and state in('reserved','running') returning * into attempt_row;
  update tongs.hammer_video_render_operations set state=next_state,failure_code=p_failure_code,failure_message=p_failure_message,updated_at=now()
  where operation_id=p_operation_id and operation_fingerprint=p_operation_fingerprint and state='rendering' returning * into op;
  return jsonb_build_object('disposition',case when op.operation_id is null then'not_updated'else next_state end,'operation',to_jsonb(op));
end$$;

create or replace function tongs.resolve_hammer_video_master(p_operation_id text,p_operation_fingerprint text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare op tongs.hammer_video_render_operations%rowtype; a tongs.assets%rowtype;
begin
  select * into op from tongs.hammer_video_render_operations where operation_id=p_operation_id and operation_fingerprint=p_operation_fingerprint;
  if not found then return jsonb_build_object('disposition','operation_not_found'); end if;
  if auth.role()<>'service_role' and not tongs.has_workspace_role(op.workspace_id,'viewer') then raise exception 'Hammer video master read denied' using errcode='42501'; end if;
  if op.state<>'completed' or op.output_asset_id is null then return jsonb_build_object('disposition','not_completed','state',op.state); end if;
  select * into a from tongs.assets where id=op.output_asset_id and workspace_id=op.workspace_id and workpiece_id=op.workpiece_id and asset_kind='hammer_video_master';
  if not found then return jsonb_build_object('disposition','master_relationship_invalid'); end if;
  return jsonb_build_object('disposition','resolved','operation',to_jsonb(op),'asset',to_jsonb(a),'receipt',op.receipt_json);
end$$;

revoke all on function tongs.begin_hammer_video_render(text,text,uuid,uuid,uuid,bigint,text,text,text,uuid,uuid,text,text,jsonb,uuid),tongs.reserve_hammer_video_render_attempt(text,text,text,integer),tongs.commit_hammer_video_master(text,text,uuid,text,text,bigint,text,text,text,bigint,integer,integer,numeric,jsonb,text),tongs.fail_hammer_video_render(text,text,uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function tongs.begin_hammer_video_render(text,text,uuid,uuid,uuid,bigint,text,text,text,uuid,uuid,text,text,jsonb,uuid),tongs.reserve_hammer_video_render_attempt(text,text,text,integer),tongs.commit_hammer_video_master(text,text,uuid,text,text,bigint,text,text,text,bigint,integer,integer,numeric,jsonb,text),tongs.fail_hammer_video_render(text,text,uuid,text,text,boolean) to service_role;
revoke all on function tongs.resolve_hammer_video_master(text,text) from public,anon;
grant execute on function tongs.resolve_hammer_video_master(text,text) to authenticated,service_role;

commit;
