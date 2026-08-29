begin;

create function tongs.he8b1a_migration_boundary()
returns void language sql set search_path = pg_catalog as $$ select null::void $$;

do $$ begin execute $ddl$
  create table tongs.hammer_history_epoch_atomic_parent_evidence (
    transition_id uuid primary key references tongs.hammer_history_epoch_head_transitions(transition_id) on delete restrict,
    workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
    workpiece_id uuid not null references tongs.episodes(id) on delete restrict,
    recording_revision_id uuid not null references tongs.recording_revisions(id) on delete restrict,
    idempotency_key text not null,
    parent_bytes bigint not null check (parent_bytes > 0),
    created_at timestamptz not null default now(),
    unique (workspace_id, workpiece_id, recording_revision_id, idempotency_key)
  )
$ddl$;
execute $ddl$comment on table tongs.hammer_history_epoch_atomic_parent_evidence is
  'Append-only parent byte evidence completing unified component-and-head operation receipts.'$ddl$;
execute $ddl$comment on column tongs.hammer_history_epoch_atomic_parent_evidence.parent_bytes is
  'Exact immutable parent byte count used by the unified operation CAS.'$ddl$;
execute $ddl$create trigger trg_hammer_history_epoch_atomic_parent_evidence_immutable
  before update or delete on tongs.hammer_history_epoch_atomic_parent_evidence
  for each row execute function tongs.reject_hammer_history_immutable_mutation()$ddl$;
execute $ddl$alter table tongs.hammer_history_epoch_atomic_parent_evidence enable row level security$ddl$;
execute $ddl$create policy hammer_history_epoch_atomic_parent_evidence_select_if_viewer
  on tongs.hammer_history_epoch_atomic_parent_evidence for select to authenticated
  using (tongs.has_workspace_role(workspace_id,'viewer'))$ddl$;
execute $ddl$grant select on table tongs.hammer_history_epoch_atomic_parent_evidence to authenticated$ddl$;
execute $ddl$revoke insert, update, delete on table tongs.hammer_history_epoch_atomic_parent_evidence from authenticated$ddl$;
execute $ddl$grant all on table tongs.hammer_history_epoch_atomic_parent_evidence to service_role$ddl$;
execute $ddl$drop function tongs.commit_hammer_history_epoch_head_with_components(
  uuid,uuid,uuid,uuid,uuid,uuid,bigint,text,text,timestamptz,text,uuid,text,bigint,timestamptz,
  jsonb,text,text,bigint,bigint,timestamptz,text,text,text,jsonb,jsonb
)$ddl$;
end $$;

create function tongs.commit_hammer_history_epoch_head_with_components(
  p_workspace_id uuid, p_workpiece_id uuid, p_canonical_recording_id uuid, p_revision_id uuid,
  p_epoch_id uuid, p_head_id uuid, p_sequence bigint, p_idempotency_key text,
  p_operation_fingerprint text, p_expected_revision_updated_at timestamptz, p_expected_history_path text,
  p_parent_head_id uuid, p_parent_sha256 text, p_parent_bytes bigint, p_parent_registry_revision bigint,
  p_parent_registry_updated_at timestamptz, p_component_changes jsonb,
  p_head_path text, p_head_sha256 text, p_head_bytes bigint, p_head_registry_revision bigint,
  p_head_registry_updated_at timestamptz, p_head_storage_bucket text, p_head_storage_key text,
  p_result_editor_state_hash text, p_result_component_authority jsonb, p_envelope jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, tongs
as $$
declare
  v_actor uuid := auth.uid(); v_revision tongs.recording_revisions%rowtype;
  v_existing tongs.hammer_history_epoch_head_transitions%rowtype; v_change jsonb;
  v_current tongs.workpiece_files%rowtype; v_parent tongs.workpiece_files%rowtype;
  v_result jsonb; v_code text; v_expected_path text; v_transition_id uuid; v_recorded_parent_bytes bigint;
begin
  if v_actor is null or not tongs.has_workspace_role(p_workspace_id, 'editor') then
    return jsonb_build_object('outcome','conflict','code','history_epoch_atomic_forbidden','terminal',true,'retryable',false);
  end if;
  if p_parent_bytes is null or p_parent_bytes <= 0
    or jsonb_typeof(p_component_changes) <> 'array' or jsonb_array_length(p_component_changes) = 0
    or jsonb_array_length(p_component_changes) > 5
    or (select count(distinct value->>'component') from jsonb_array_elements(p_component_changes)) <> jsonb_array_length(p_component_changes)
    or (select count(distinct value->>'path') from jsonb_array_elements(p_component_changes)) <> jsonb_array_length(p_component_changes)
    or p_head_storage_bucket <> 'forge-workpieces'
    or p_head_storage_key <> format('workpieces/%s/%s', p_workpiece_id, p_head_path) then
    return jsonb_build_object('outcome','conflict','code','history_epoch_atomic_request_invalid','terminal',true,'retryable',false);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || p_workpiece_id::text || ':' || p_revision_id::text, 0));
  select * into v_existing from tongs.hammer_history_epoch_head_transitions
    where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and recording_revision_id=p_revision_id
      and idempotency_key=p_idempotency_key;
  if v_existing.transition_id is not null then
    select parent_bytes into v_recorded_parent_bytes from tongs.hammer_history_epoch_atomic_parent_evidence
      where transition_id=v_existing.transition_id;
    if v_existing.operation_fingerprint=p_operation_fingerprint and v_existing.head_id=p_head_id
      and v_existing.epoch_id=p_epoch_id and v_existing.sequence=p_sequence
      and v_existing.canonical_recording_id=p_canonical_recording_id
      and v_existing.expected_revision_updated_at=p_expected_revision_updated_at
      and v_existing.expected_history_path=p_expected_history_path
      and v_existing.parent_head_id is not distinct from p_parent_head_id
      and v_existing.parent_sha256=p_parent_sha256 and v_recorded_parent_bytes=p_parent_bytes
      and v_existing.parent_registry_revision=p_parent_registry_revision
      and v_existing.parent_registry_updated_at=p_parent_registry_updated_at
      and v_existing.committed_history_path=p_head_path
      and v_existing.head_sha256=p_head_sha256 and v_existing.head_bytes=p_head_bytes
      and v_existing.head_registry_revision=p_head_registry_revision
      and v_existing.head_registry_updated_at=p_head_registry_updated_at
      and v_existing.result_editor_state_hash=p_result_editor_state_hash
      and v_existing.result_component_authority=p_result_component_authority
      and v_existing.envelope->'component_changes'=p_component_changes
      and v_existing.envelope=p_envelope
    then
      return jsonb_build_object('outcome','already_committed','epoch_id',v_existing.epoch_id,'head_id',v_existing.head_id,
        'sequence',v_existing.sequence,'transition_id',v_existing.transition_id,'history_path',v_existing.committed_history_path,
        'revision_updated_at',v_existing.committed_revision_updated_at,'operation_fingerprint',v_existing.operation_fingerprint);
    end if;
    return jsonb_build_object('outcome','conflict','code','history_epoch_atomic_idempotency_conflict','terminal',true,'retryable',false);
  end if;
  select rr.* into v_revision from tongs.recording_revisions rr
    join tongs.episodes e on e.id=rr.workpiece_id and e.workspace_id=rr.workspace_id and e.active_revision_id=rr.id
    where rr.id=p_revision_id and rr.workspace_id=p_workspace_id and rr.workpiece_id=p_workpiece_id
      and rr.canonical_recording_id=p_canonical_recording_id and rr.status='active' for update of rr;
  if v_revision.id is null then return jsonb_build_object('outcome','conflict','code','history_epoch_atomic_identity_conflict','terminal',true,'retryable',false); end if;
  if v_revision.updated_at <> p_expected_revision_updated_at then return jsonb_build_object('outcome','conflict','code','history_epoch_atomic_revision_token_conflict','terminal',true,'retryable',false); end if;
  if v_revision.history_path is distinct from p_expected_history_path then return jsonb_build_object('outcome','conflict','code','history_epoch_atomic_pointer_conflict','terminal',true,'retryable',false); end if;
  if p_envelope->'component_changes' is distinct from p_component_changes then
    return jsonb_build_object('outcome','conflict','code','history_epoch_atomic_envelope_conflict','terminal',true,'retryable',false);
  end if;
  select * into v_parent from tongs.workpiece_files
    where workpiece_id=p_workpiece_id and path=p_expected_history_path for update;
  if v_parent.workpiece_id is null or v_parent.bytes<>p_parent_bytes or lower(v_parent.hash_value)<>p_parent_sha256
    or v_parent.revision<>p_parent_registry_revision or v_parent.updated_at<>p_parent_registry_updated_at
    or v_parent.content_type<>'application/json' or v_parent.hash_algo<>'sha256'
    or v_parent.storage_bucket<>'forge-workpieces'
    or v_parent.storage_key<>format('workpieces/%s/%s',p_workpiece_id,p_expected_history_path)
  then return jsonb_build_object('outcome','conflict','code','history_epoch_atomic_parent_conflict','terminal',true,'retryable',false); end if;

  begin
    perform set_config('tongs.history_atomic_registry_tokens','on',true);
    for v_change in select value from jsonb_array_elements(p_component_changes) loop
      if jsonb_typeof(v_change) <> 'object' or (select count(*) from jsonb_object_keys(v_change)) <> 4
        or not (v_change ?& array['component','path','expected','next'])
        or (v_change->>'component') not in ('audio','editorial_authority','transcript','visual_placements','visual_timeline')
        or jsonb_typeof(v_change->'expected') <> 'object' or jsonb_typeof(v_change->'next') <> 'object'
        or (select count(*) from jsonb_object_keys(v_change->'expected')) <> 6
        or not ((v_change->'expected') ?& array['sha256','bytes','revision','updated_at','storage_bucket','storage_key'])
        or (select count(*) from jsonb_object_keys(v_change->'next')) <> 6
        or not ((v_change->'next') ?& array['sha256','bytes','revision','updated_at','storage_bucket','storage_key'])
      then v_code := 'history_epoch_atomic_component_invalid'; raise exception using errcode='P0001'; end if;
      v_expected_path := case v_change->>'component'
        when 'transcript' then v_revision.revision_transcript_path
        when 'visual_timeline' then v_revision.visual_timeline_path
        when 'visual_placements' then v_revision.visual_placements_path
        when 'audio' then v_revision.audio_polish_path
        when 'editorial_authority' then v_revision.editorial_authority_path
      end;
      if v_expected_path is null or v_change->>'path' <> v_expected_path
      then v_code := 'history_epoch_atomic_component_invalid'; raise exception using errcode='P0001'; end if;
      select * into v_current from tongs.workpiece_files where workpiece_id=p_workpiece_id and path=v_change->>'path' for update;
      if v_current.workpiece_id is null
        or lower(v_current.hash_value) <> v_change#>>'{expected,sha256}' or v_current.bytes <> (v_change#>>'{expected,bytes}')::bigint
        or v_current.revision <> (v_change#>>'{expected,revision}')::bigint
        or v_current.updated_at <> (v_change#>>'{expected,updated_at}')::timestamptz
        or v_current.storage_bucket <> v_change#>>'{expected,storage_bucket}' or v_current.storage_key <> v_change#>>'{expected,storage_key}'
      then v_code := 'history_epoch_atomic_component_conflict'; raise exception using errcode='P0001'; end if;
      if v_change#>>'{next,sha256}' !~ '^[0-9a-f]{64}$' or (v_change#>>'{next,bytes}')::bigint <= 0
        or (v_change#>>'{next,revision}')::bigint <> v_current.revision + 1
        or (v_change#>>'{next,sha256}') = lower(v_current.hash_value)
        or (v_change#>>'{next,updated_at}')::timestamptz <= v_current.updated_at
        or v_change#>>'{next,storage_bucket}' <> 'forge-workpieces'
        or v_change#>>'{next,storage_key}' !~ format('^workpieces/%s/hammer/staging/history-atomic/%s/',p_workpiece_id,p_head_id)
      then v_code := 'history_epoch_atomic_component_invalid'; raise exception using errcode='P0001'; end if;
      update tongs.workpiece_files set hash_value=v_change#>>'{next,sha256}', bytes=(v_change#>>'{next,bytes}')::bigint,
        revision=(v_change#>>'{next,revision}')::bigint, updated_at=(v_change#>>'{next,updated_at}')::timestamptz,
        storage_bucket=v_change#>>'{next,storage_bucket}', storage_key=v_change#>>'{next,storage_key}',
        written_by_tool='tongs', written_by_tool_version='history-atomic-v1', written_by_lane='forge-managed'
        where workpiece_id=p_workpiece_id and path=v_change->>'path';
    end loop;
    insert into tongs.workpiece_files(workpiece_id,path,file_type,content_type,bytes,hash_algo,hash_value,storage_bucket,storage_key,written_by_tool,written_by_tool_version,written_by_lane,revision,updated_at)
      values(p_workpiece_id,p_head_path,'hammer_history_epoch_head','application/json',p_head_bytes,'sha256',p_head_sha256,
        p_head_storage_bucket,p_head_storage_key,'tongs','history-atomic-v1','forge-managed',p_head_registry_revision,p_head_registry_updated_at);
    v_result := tongs.commit_hammer_history_epoch_head(p_workspace_id,p_workpiece_id,p_canonical_recording_id,p_revision_id,
      p_epoch_id,p_head_id,p_sequence,p_idempotency_key,p_operation_fingerprint,p_expected_revision_updated_at,p_expected_history_path,
      p_parent_head_id,p_parent_sha256,p_parent_registry_revision,p_parent_registry_updated_at,p_head_path,p_head_sha256,p_head_bytes,
      p_head_registry_revision,p_head_registry_updated_at,p_result_editor_state_hash,p_result_component_authority,p_envelope);
    if v_result->>'outcome'='conflict' then v_code:=v_result->>'code'; raise exception using errcode='P0001'; end if;
    v_transition_id := (v_result->>'transition_id')::uuid;
    insert into tongs.hammer_history_epoch_atomic_parent_evidence(
      transition_id,workspace_id,workpiece_id,recording_revision_id,idempotency_key,parent_bytes
    ) values(v_transition_id,p_workspace_id,p_workpiece_id,p_revision_id,p_idempotency_key,p_parent_bytes);
    return v_result;
  exception
    when sqlstate 'P0001' then return jsonb_build_object('outcome','conflict','code',coalesce(v_code,'history_epoch_atomic_conflict'),'terminal',true,'retryable',false);
    when unique_violation then return jsonb_build_object('outcome','conflict','code','history_epoch_atomic_uniqueness_conflict','terminal',true,'retryable',false);
    when foreign_key_violation or check_violation or not_null_violation or invalid_text_representation then
      return jsonb_build_object('outcome','conflict','code','history_epoch_atomic_constraint_conflict','terminal',true,'retryable',false);
  end;
end;
$$;

revoke all on function tongs.commit_hammer_history_epoch_head_with_components(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text,text,timestamptz,text,uuid,text,bigint,bigint,timestamptz,jsonb,text,text,bigint,bigint,timestamptz,text,text,text,jsonb,jsonb) from public;
grant execute on function tongs.commit_hammer_history_epoch_head_with_components(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text,text,timestamptz,text,uuid,text,bigint,bigint,timestamptz,jsonb,text,text,bigint,bigint,timestamptz,text,text,text,jsonb,jsonb) to authenticated;
grant execute on function tongs.commit_hammer_history_epoch_head_with_components(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text,text,timestamptz,text,uuid,text,bigint,bigint,timestamptz,jsonb,text,text,bigint,bigint,timestamptz,text,text,text,jsonb,jsonb) to service_role;
alter function tongs.commit_hammer_history_epoch_head_with_components(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text,text,timestamptz,text,uuid,text,bigint,bigint,timestamptz,jsonb,text,text,bigint,bigint,timestamptz,text,text,text,jsonb,jsonb) owner to postgres;
comment on function tongs.commit_hammer_history_epoch_head_with_components(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text,text,timestamptz,text,uuid,text,bigint,bigint,timestamptz,jsonb,text,text,bigint,bigint,timestamptz,text,text,text,jsonb,jsonb) is
  'Atomically installs changed component authority and an immutable history head, including exact parent byte evidence.';

create or replace function tongs.read_hammer_history_epoch_head_with_components_operation(
  p_workspace_id uuid, p_workpiece_id uuid, p_revision_id uuid, p_idempotency_key text,
  p_operation_fingerprint text default null, p_head_id uuid default null
) returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, tongs
as $$
declare v_transition tongs.hammer_history_epoch_head_transitions%rowtype; v_parent_bytes bigint;
begin
  if auth.uid() is null or not tongs.has_workspace_role(p_workspace_id,'viewer') then
    return jsonb_build_object('outcome','conflict','code','history_epoch_atomic_readback_forbidden','terminal',true,'retryable',false);
  end if;
  select * into v_transition from tongs.hammer_history_epoch_head_transitions
    where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id
      and recording_revision_id=p_revision_id and idempotency_key=p_idempotency_key;
  if v_transition.transition_id is null then return jsonb_build_object('outcome','absent','conclusive',true); end if;
  select parent_bytes into v_parent_bytes from tongs.hammer_history_epoch_atomic_parent_evidence
    where transition_id=v_transition.transition_id;
  if v_parent_bytes is null then
    return jsonb_build_object('outcome','conflict','code','history_epoch_atomic_evidence_missing','terminal',true,'retryable',false);
  end if;
  if (p_operation_fingerprint is not null and p_operation_fingerprint<>v_transition.operation_fingerprint)
    or (p_head_id is not null and p_head_id<>v_transition.head_id) then
    return jsonb_build_object('outcome','conflict','code','history_epoch_atomic_operation_mismatch','terminal',true,'retryable',false,
      'replacement_head_id',v_transition.head_id,'replacement_operation_fingerprint',v_transition.operation_fingerprint);
  end if;
  return jsonb_build_object(
    'outcome','committed','idempotency_key',v_transition.idempotency_key,'operation_fingerprint',v_transition.operation_fingerprint,
    'transition_id',v_transition.transition_id,'epoch_id',v_transition.epoch_id,'head_id',v_transition.head_id,
    'workspace_id',v_transition.workspace_id,'workpiece_id',v_transition.workpiece_id,
    'canonical_recording_id',v_transition.canonical_recording_id,'recording_revision_id',v_transition.recording_revision_id,
    'sequence',v_transition.sequence,'envelope',v_transition.envelope,
    'component_changes',v_transition.envelope->'component_changes','result_component_authority',v_transition.result_component_authority,
    'result_editor_state_hash',v_transition.result_editor_state_hash,
    'parent',jsonb_build_object('head_id',v_transition.parent_head_id,'path',v_transition.expected_history_path,
      'sequence',v_transition.sequence-1,'sha256',v_transition.parent_sha256,'bytes',v_parent_bytes,
      'registry_revision',v_transition.parent_registry_revision,'registry_updated_at',v_transition.parent_registry_updated_at,
      'content_type','application/json'),
    'head',jsonb_build_object('head_id',v_transition.head_id,'path',v_transition.committed_history_path,'sha256',v_transition.head_sha256,
      'bytes',v_transition.head_bytes,'registry_revision',v_transition.head_registry_revision,
      'registry_updated_at',v_transition.head_registry_updated_at,'content_type','application/json'),
    'history_path',v_transition.committed_history_path,'revision_updated_at',v_transition.committed_revision_updated_at
  );
end;
$$;
revoke all on function tongs.read_hammer_history_epoch_head_with_components_operation(uuid,uuid,uuid,text,text,uuid) from public;
grant execute on function tongs.read_hammer_history_epoch_head_with_components_operation(uuid,uuid,uuid,text,text,uuid) to authenticated;
grant execute on function tongs.read_hammer_history_epoch_head_with_components_operation(uuid,uuid,uuid,text,text,uuid) to service_role;
alter function tongs.read_hammer_history_epoch_head_with_components_operation(uuid,uuid,uuid,text,text,uuid) owner to postgres;
comment on function tongs.read_hammer_history_epoch_head_with_components_operation(uuid,uuid,uuid,text,text,uuid) is
  'Conclusive authorized readback of the complete immutable unified component-and-head operation evidence.';

drop function tongs.he8b1a_migration_boundary();

commit;
