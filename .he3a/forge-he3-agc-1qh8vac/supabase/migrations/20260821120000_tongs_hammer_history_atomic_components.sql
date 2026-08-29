begin;

create or replace function tongs.workpiece_file_advance_revision()
returns trigger language plpgsql security invoker set search_path = pg_catalog, tongs as $$
begin
  if current_setting('tongs.history_atomic_registry_tokens', true) = 'on' then
    if new.revision <> old.revision + 1 then
      raise exception using errcode='23514', message='history_atomic_registry_revision_invalid';
    end if;
  else new.revision := old.revision + 1; end if;
  return new;
end;
$$;

create or replace function tongs.workpiece_file_set_updated_at()
returns trigger language plpgsql security invoker set search_path = pg_catalog, tongs as $$
begin
  if current_setting('tongs.history_atomic_registry_tokens', true) <> 'on' then new.updated_at := now(); end if;
  return new;
end;
$$;

drop trigger if exists trg_workpiece_files_updated_at on tongs.workpiece_files;
create trigger trg_workpiece_files_updated_at before update on tongs.workpiece_files
for each row execute function tongs.workpiece_file_set_updated_at();
alter function tongs.workpiece_file_advance_revision() owner to postgres;
alter function tongs.workpiece_file_set_updated_at() owner to postgres;
revoke all on function tongs.workpiece_file_advance_revision() from public, anon, authenticated;
revoke all on function tongs.workpiece_file_set_updated_at() from public, anon, authenticated;

-- Forward compatibility: a component selected by an immutable head may reference an
-- operation-owned staging object. The registry row is still the sole authority and
-- is installed only by the atomic RPC below.
create or replace function tongs.is_hammer_history_component_authority(p_authority jsonb)
returns boolean
language plpgsql
stable
security invoker
set search_path = pg_catalog, tongs
as $$
declare
  v_key text; v_value jsonb; v_file tongs.workpiece_files%rowtype; v_workpiece_id uuid;
begin
  if jsonb_typeof(p_authority) <> 'object'
    or not (p_authority ?& array['transcript','visual_timeline','visual_placements','audio','editorial_authority'])
    or (select count(*) from jsonb_object_keys(p_authority)) <> 5 then return false; end if;
  begin v_workpiece_id := (p_authority->'transcript'->>'workpiece_id')::uuid;
  exception when others then return false; end;
  for v_key, v_value in select key, value from jsonb_each(p_authority) loop
    if jsonb_typeof(v_value) <> 'object' or (select count(*) from jsonb_object_keys(v_value)) <> 7
      or not (v_value ?& array['workpiece_id','path','sha256','bytes','registry_revision','registry_updated_at','content_type'])
      or v_value->>'workpiece_id' <> v_workpiece_id::text or coalesce(v_value->>'path','') = ''
      or v_value->>'path' ~ '(^/|\.\.)' or v_value->>'sha256' !~ '^[0-9a-f]{64}$'
      or v_value->>'bytes' !~ '^[1-9][0-9]*$' or v_value->>'registry_revision' !~ '^[1-9][0-9]*$'
      or v_value->>'content_type' <> 'application/json' then return false; end if;
    begin perform (v_value->>'registry_updated_at')::timestamptz;
    exception when others then return false; end;
    select * into v_file from tongs.workpiece_files
      where workpiece_id = v_workpiece_id and path = v_value->>'path';
    if v_file.workpiece_id is null or lower(v_file.hash_value) <> v_value->>'sha256'
      or v_file.bytes <> (v_value->>'bytes')::bigint or v_file.revision <> (v_value->>'registry_revision')::bigint
      or v_file.updated_at <> (v_value->>'registry_updated_at')::timestamptz
      or v_file.content_type <> 'application/json' or v_file.hash_algo <> 'sha256'
      or v_file.storage_bucket <> 'forge-workpieces'
      or not (v_file.storage_key = format('workpieces/%s/%s', v_workpiece_id, v_value->>'path')
        or v_file.storage_key ~ format('^workpieces/%s/hammer/staging/history-atomic/[0-9a-f-]+/', v_workpiece_id))
    then return false; end if;
  end loop;
  return true;
end;
$$;

create or replace function tongs.commit_hammer_history_epoch_head_with_components(
  p_workspace_id uuid, p_workpiece_id uuid, p_canonical_recording_id uuid, p_revision_id uuid,
  p_epoch_id uuid, p_head_id uuid, p_sequence bigint, p_idempotency_key text,
  p_operation_fingerprint text, p_expected_revision_updated_at timestamptz, p_expected_history_path text,
  p_parent_head_id uuid, p_parent_sha256 text, p_parent_registry_revision bigint,
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
  v_current tongs.workpiece_files%rowtype; v_result jsonb; v_code text; v_expected_path text;
begin
  if v_actor is null or not tongs.has_workspace_role(p_workspace_id, 'editor') then
    return jsonb_build_object('outcome','conflict','code','history_epoch_atomic_forbidden','terminal',true,'retryable',false);
  end if;
  if jsonb_typeof(p_component_changes) <> 'array' or jsonb_array_length(p_component_changes) = 0
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
    if v_existing.operation_fingerprint=p_operation_fingerprint and v_existing.head_id=p_head_id
      and v_existing.epoch_id=p_epoch_id and v_existing.sequence=p_sequence
      and v_existing.canonical_recording_id=p_canonical_recording_id
      and v_existing.expected_revision_updated_at=p_expected_revision_updated_at
      and v_existing.expected_history_path=p_expected_history_path
      and v_existing.parent_head_id is not distinct from p_parent_head_id
      and v_existing.parent_sha256=p_parent_sha256
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
    return v_result;
  exception
    when sqlstate 'P0001' then return jsonb_build_object('outcome','conflict','code',coalesce(v_code,'history_epoch_atomic_conflict'),'terminal',true,'retryable',false);
    when unique_violation then return jsonb_build_object('outcome','conflict','code','history_epoch_atomic_uniqueness_conflict','terminal',true,'retryable',false);
    when foreign_key_violation or check_violation or not_null_violation or invalid_text_representation then
      return jsonb_build_object('outcome','conflict','code','history_epoch_atomic_constraint_conflict','terminal',true,'retryable',false);
  end;
end;
$$;

revoke all on function tongs.commit_hammer_history_epoch_head_with_components(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text,text,timestamptz,text,uuid,text,bigint,timestamptz,jsonb,text,text,bigint,bigint,timestamptz,text,text,text,jsonb,jsonb) from public;
grant execute on function tongs.commit_hammer_history_epoch_head_with_components(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text,text,timestamptz,text,uuid,text,bigint,timestamptz,jsonb,text,text,bigint,bigint,timestamptz,text,text,text,jsonb,jsonb) to authenticated;
grant execute on function tongs.commit_hammer_history_epoch_head_with_components(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text,text,timestamptz,text,uuid,text,bigint,timestamptz,jsonb,text,text,bigint,bigint,timestamptz,text,text,text,jsonb,jsonb) to service_role;
alter function tongs.commit_hammer_history_epoch_head_with_components(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text,text,timestamptz,text,uuid,text,bigint,timestamptz,jsonb,text,text,bigint,bigint,timestamptz,text,text,text,jsonb,jsonb) owner to postgres;
comment on function tongs.commit_hammer_history_epoch_head_with_components(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text,text,timestamptz,text,uuid,text,bigint,timestamptz,jsonb,text,text,bigint,bigint,timestamptz,text,text,text,jsonb,jsonb) is
  'Atomically installs changed revision component registry authority and one immutable epoch head under a frozen revision/parent CAS basis.';

create or replace function tongs.read_hammer_history_epoch_head_with_components_operation(
  p_workspace_id uuid, p_workpiece_id uuid, p_revision_id uuid, p_idempotency_key text,
  p_operation_fingerprint text default null, p_head_id uuid default null
) returns jsonb language sql stable security invoker set search_path = pg_catalog, tongs as $$
  select tongs.read_hammer_history_epoch_head_operation(
    p_workspace_id,p_workpiece_id,p_revision_id,p_idempotency_key,p_operation_fingerprint,p_head_id
  );
$$;
revoke all on function tongs.read_hammer_history_epoch_head_with_components_operation(uuid,uuid,uuid,text,text,uuid) from public;
grant execute on function tongs.read_hammer_history_epoch_head_with_components_operation(uuid,uuid,uuid,text,text,uuid) to authenticated;
grant execute on function tongs.read_hammer_history_epoch_head_with_components_operation(uuid,uuid,uuid,text,text,uuid) to service_role;
alter function tongs.read_hammer_history_epoch_head_with_components_operation(uuid,uuid,uuid,text,text,uuid) owner to postgres;
comment on function tongs.read_hammer_history_epoch_head_with_components_operation(uuid,uuid,uuid,text,text,uuid) is
  'Idempotent authorized readback for unified component-and-head transitions.';

commit;
