begin;

create table if not exists tongs.episode_split_recovery_receipts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  project_id uuid not null references tongs.barstock_assignments(id) on delete restrict,
  source_workpiece_id uuid not null references tongs.episodes(id) on delete restrict,
  destination_workpiece_id uuid not null references tongs.episodes(id) on delete restrict,
  operation_key text not null,
  manifest_hash text not null check (manifest_hash ~ '^[0-9a-f]{64}$'),
  manifest_json jsonb not null,
  receipt_json jsonb not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (workspace_id, project_id, operation_key),
  unique (workspace_id, destination_workpiece_id)
);

alter table tongs.episode_split_recovery_receipts enable row level security;
create policy episode_split_recovery_receipts_viewer on tongs.episode_split_recovery_receipts
  for select to authenticated using (tongs.has_workspace_role(workspace_id,'viewer'));
revoke all on tongs.episode_split_recovery_receipts from public,anon,authenticated;
grant select on tongs.episode_split_recovery_receipts to authenticated;

create or replace function tongs.episode_split_recovery_manifest_hash(p_manifest jsonb)
returns text language sql immutable set search_path=pg_catalog,tongs as $$
  select encode(extensions.digest(convert_to(p_manifest::text,'UTF8'),'sha256'),'hex')
$$;

create or replace function tongs.apply_episode_split_recovery(
  p_manifest jsonb,
  p_manifest_hash text,
  p_operation_key text,
  p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare
  w uuid := (p_manifest->>'workspace_id')::uuid;
  project uuid := (p_manifest->>'project_id')::uuid;
  source_wp uuid := (p_manifest->>'source_workpiece_id')::uuid;
  destination_wp uuid := (p_manifest->>'destination_workpiece_id')::uuid;
  source_approval uuid := (p_manifest->>'source_restore_approval_id')::uuid;
  destination_source_approval uuid := (p_manifest->>'destination_source_approval_id')::uuid;
  destination_approval uuid := (p_manifest->>'destination_approval_id')::uuid;
  destination_link uuid := (p_manifest->>'destination_link_id')::uuid;
  source_script jsonb := p_manifest->'staged_files'->'source_script';
  source_chat jsonb := p_manifest->'staged_files'->'source_chat';
  destination_script jsonb := p_manifest->'staged_files'->'destination_script';
  destination_chat jsonb := p_manifest->'staged_files'->'destination_chat';
  expected_hash text;
  prior tongs.episode_split_recovery_receipts%rowtype;
  src tongs.script_approval_revisions%rowtype;
  dst_src tongs.script_approval_revisions%rowtype;
  receipt jsonb;
begin
  if p_actor_id is null or (auth.role()<>'service_role' and (auth.uid() is distinct from p_actor_id or not tongs.has_workspace_role(w,'owner'))) then
    raise exception 'workspace owner authority required' using errcode='42501';
  end if;
  expected_hash := tongs.episode_split_recovery_manifest_hash(p_manifest);
  if p_manifest_hash !~ '^[0-9a-f]{64}$' or expected_hash <> p_manifest_hash then
    return jsonb_build_object('outcome','manifest_hash_mismatch','expected_manifest_hash',expected_hash);
  end if;
  if length(btrim(coalesce(p_operation_key,''))) not between 16 and 200 then
    return jsonb_build_object('outcome','invalid_operation_key');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(w::text||':'||project::text||':'||p_operation_key,0));
  select * into prior from tongs.episode_split_recovery_receipts
    where workspace_id=w and project_id=project and operation_key=p_operation_key;
  if found then
    if prior.manifest_hash <> p_manifest_hash then return jsonb_build_object('outcome','operation_identity_conflict'); end if;
    return prior.receipt_json;
  end if;
  if not exists(select 1 from tongs.barstock_project_episode_links where workspace_id=w and project_id=project and workpiece_id=source_wp)
    or exists(select 1 from tongs.episodes where id=destination_wp) then
    return jsonb_build_object('outcome','identity_precondition_failed');
  end if;
  select * into src from tongs.script_approval_revisions where id=source_approval and workspace_id=w and workpiece_id=source_wp;
  select * into dst_src from tongs.script_approval_revisions where id=destination_source_approval and workspace_id=w and workpiece_id=source_wp;
  if src.id is null or dst_src.id is null
    or src.script_content_hash <> p_manifest->>'source_restore_script_hash'
    or dst_src.script_content_hash <> p_manifest->>'destination_script_hash' then
    return jsonb_build_object('outcome','script_precondition_failed');
  end if;
  if not exists(select 1 from tongs.workpiece_script_approval_sequences where workspace_id=w and workpiece_id=source_wp and current_approval_id=destination_source_approval and current_revision=(p_manifest->>'expected_source_approval_revision')::bigint)
    or not exists(select 1 from tongs.workpiece_image_map_sequences where workspace_id=w and workpiece_id=source_wp and current_revision_id=(p_manifest->>'expected_image_revision_id')::uuid)
    or not exists(select 1 from tongs.broll_plan_sequences where workspace_id=w and workpiece_id=source_wp and current_plan_revision_id=(p_manifest->>'expected_broll_revision_id')::uuid)
    or not exists(select 1 from tongs.reference_clip_plan_sequences where workspace_id=w and workpiece_id=source_wp and current_plan_revision_id=(p_manifest->>'expected_reference_clip_revision_id')::uuid)
    or not exists(select 1 from tongs.reference_visual_plan_sequences where workspace_id=w and workpiece_id=source_wp and current_plan_revision_id=(p_manifest->>'expected_reference_visual_revision_id')::uuid)
    or not exists(select 1 from tongs.workpiece_files where workpiece_id=source_wp and path='hearth/chat.v1.json' and revision=(p_manifest->>'expected_chat_revision')::bigint and hash_value=p_manifest->>'expected_chat_hash') then
    return jsonb_build_object('outcome','authority_precondition_failed');
  end if;
  if exists(select 1 from jsonb_each(p_manifest->'staged_files') f where f.value->>'hash_value' !~ '^[0-9a-f]{64}$' or (f.value->>'bytes')::bigint < 0) then
    return jsonb_build_object('outcome','staged_file_evidence_invalid');
  end if;

  insert into tongs.episodes(id,workspace_id,label) values(destination_wp,w,p_manifest->>'destination_label');
  insert into tongs.barstock_project_episode_links(id,workspace_id,project_id,workpiece_id,creation_operation_key,created_by)
    values(destination_link,w,project,destination_wp,p_operation_key,p_actor_id);
  insert into tongs.script_approval_revisions(id,workspace_id,workpiece_id,approval_revision,source_file_path,source_file_revision,script_content_hash,semantic_state_hash,immutable_revision_hash,script_text,approval_contract_version,creator_version_label,created_by)
    values(destination_approval,w,destination_wp,1,'script/script.md',1,dst_src.script_content_hash,dst_src.semantic_state_hash,
      encode(extensions.digest(convert_to(jsonb_build_object('source_approval_id',dst_src.id,'destination_workpiece_id',destination_wp,'manifest_hash',p_manifest_hash)::text,'UTF8'),'sha256'),'hex'),
      dst_src.script_text,dst_src.approval_contract_version,dst_src.creator_version_label,p_actor_id);
  insert into tongs.workpiece_script_approval_sequences(workspace_id,workpiece_id,current_approval_id,current_revision) values(w,destination_wp,destination_approval,1);

  update tongs.workpiece_script_approval_sequences set current_approval_id=source_approval,current_revision=src.approval_revision,updated_at=now() where workspace_id=w and workpiece_id=source_wp;
  update tongs.workpiece_image_map_sequences set current_revision_id=(p_manifest->>'restore_image_revision_id')::uuid,current_revision=(p_manifest->>'restore_image_revision')::bigint,updated_at=now() where workspace_id=w and workpiece_id=source_wp;
  update tongs.broll_plan_sequences set current_plan_revision_id=(p_manifest->>'restore_broll_revision_id')::uuid,current_plan_revision=(p_manifest->>'restore_broll_revision')::bigint,updated_at=now() where workspace_id=w and workpiece_id=source_wp;
  update tongs.reference_clip_plan_sequences set current_plan_revision_id=(p_manifest->>'restore_reference_clip_revision_id')::uuid,current_plan_revision=(p_manifest->>'restore_reference_clip_revision')::bigint,updated_at=now() where workspace_id=w and workpiece_id=source_wp;
  update tongs.reference_visual_plan_sequences set current_plan_revision_id=(p_manifest->>'restore_reference_visual_revision_id')::uuid,current_plan_revision=(p_manifest->>'restore_reference_visual_revision')::bigint,updated_at=now() where workspace_id=w and workpiece_id=source_wp;

  update tongs.workpiece_files set bytes=(source_script->>'bytes')::bigint,hash_value=source_script->>'hash_value',storage_bucket=source_script->>'storage_bucket',storage_key=source_script->>'storage_key',revision=revision+1,updated_at=now() where workpiece_id=source_wp and path='script/script.md';
  update tongs.workpiece_files set bytes=(source_chat->>'bytes')::bigint,hash_value=source_chat->>'hash_value',storage_bucket=source_chat->>'storage_bucket',storage_key=source_chat->>'storage_key',revision=revision+1,updated_at=now() where workpiece_id=source_wp and path='hearth/chat.v1.json';
  insert into tongs.workpiece_files(workpiece_id,path,file_type,content_type,bytes,hash_algo,hash_value,storage_bucket,storage_key,written_by_tool,written_by_tool_version,written_by_lane,revision)
    values(destination_wp,'script/script.md','script','text/markdown; charset=utf-8',(destination_script->>'bytes')::bigint,'sha256',destination_script->>'hash_value',destination_script->>'storage_bucket',destination_script->>'storage_key','tongs-recovery','forge-v1.2.0','incident-recovery',1),
          (destination_wp,'hearth/chat.v1.json','json','application/json',(destination_chat->>'bytes')::bigint,'sha256',destination_chat->>'hash_value',destination_chat->>'storage_bucket',destination_chat->>'storage_key','tongs-recovery','forge-v1.2.0','incident-recovery',1);

  receipt := jsonb_build_object('outcome','applied','manifest_hash',p_manifest_hash,'operation_key',p_operation_key,'source_workpiece_id',source_wp,'destination_workpiece_id',destination_wp,'destination_approval_id',destination_approval,'applied_at',now());
  insert into tongs.episode_split_recovery_receipts(workspace_id,project_id,source_workpiece_id,destination_workpiece_id,operation_key,manifest_hash,manifest_json,receipt_json,created_by)
    values(w,project,source_wp,destination_wp,p_operation_key,p_manifest_hash,p_manifest,receipt,p_actor_id);
  return receipt;
end$$;

revoke all on function tongs.apply_episode_split_recovery(jsonb,text,text,uuid) from public,anon,authenticated;
revoke all on function tongs.episode_split_recovery_manifest_hash(jsonb) from public,anon;
grant execute on function tongs.apply_episode_split_recovery(jsonb,text,text,uuid) to authenticated,service_role;
grant execute on function tongs.episode_split_recovery_manifest_hash(jsonb) to authenticated,service_role;

commit;
