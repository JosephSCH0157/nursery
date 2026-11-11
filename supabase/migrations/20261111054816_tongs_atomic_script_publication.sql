begin;

-- The registry remains current-script authority. This ledger only owns publication
-- idempotency, terminal receipts and object-retention evidence; no financial state.
create table tongs.script_publication_operations (
  operation_id uuid primary key,
  workspace_id uuid not null,
  workpiece_id uuid not null,
  actor_id uuid not null,
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  expected_revision bigint not null check (expected_revision >= 0),
  expected_hash text,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  byte_count bigint not null check (byte_count > 0 and byte_count <= 1048576),
  storage_key text not null unique,
  state text not null default 'prepared' check (state in ('prepared','committed','conflict','abandoned')),
  receipt jsonb,
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  check ((expected_revision = 0 and expected_hash is null) or
    (expected_revision > 0 and expected_hash ~ '^[0-9a-f]{64}$')),
  check ((state = 'prepared' and receipt is null and completed_at is null) or
    (state <> 'prepared' and receipt is not null and completed_at is not null))
);
-- Deliberately no cascading foreign keys: episode deletion must retain receipts.
alter table tongs.script_publication_operations owner to postgres;
alter table tongs.script_publication_operations enable row level security;
revoke all on tongs.script_publication_operations from public, anon, authenticated, service_role;

create function tongs.guard_script_publication_operation()
returns trigger language plpgsql security invoker set search_path=pg_catalog,tongs as $$
begin
  if tg_op='DELETE' then raise exception 'publication evidence is immutable' using errcode='42501'; end if;
  if old.state <> 'prepared' or
    (to_jsonb(new)-array['state','receipt','completed_at']) is distinct from
    (to_jsonb(old)-array['state','receipt','completed_at']) then
    raise exception 'publication operation is immutable' using errcode='42501';
  end if;
  return new;
end $$;
create trigger guard_script_publication_operation before update or delete on tongs.script_publication_operations
for each row execute function tongs.guard_script_publication_operation();

create function tongs.guard_canonical_script_publication()
returns trigger language plpgsql security invoker set search_path=pg_catalog,tongs as $$
declare op tongs.script_publication_operations%rowtype;
begin
  if tg_op='DELETE' then
    if old.path='script/script.md' then
      perform 1 from tongs.episodes where id=old.workpiece_id and archived_at is not null for update;
      if not found then raise exception 'canonical script deletion requires archived episode cleanup' using errcode='42501'; end if;
    end if;
    return old;
  end if;
  if tg_op='UPDATE' and old.path='script/script.md' and
    (new.path<>old.path or new.workpiece_id<>old.workpiece_id) then
    raise exception 'canonical script identity is immutable' using errcode='42501';
  end if;
  if new.path <> 'script/script.md' then return new; end if;
  select * into op from tongs.script_publication_operations
    where operation_id::text=current_setting('tongs.script_publication_operation',true);
  if not found or op.state <> 'prepared' or op.workpiece_id <> new.workpiece_id
    or op.storage_key <> new.storage_key or op.content_hash <> new.hash_value
    or op.byte_count <> new.bytes or new.storage_bucket <> 'forge-workpieces' then
    raise exception 'conditional script publication required' using errcode='42501';
  end if;
  return new;
end $$;
create trigger guard_canonical_script_publication before insert or update or delete on tongs.workpiece_files
for each row execute function tongs.guard_canonical_script_publication();

-- Called only by Tongs after verifying the user's Auth token. Finalize additionally
-- requires Tongs to have read back and verified the immutable object bytes.
create function tongs.script_publication_command(
  p_command text, p_actor uuid, p_workspace uuid, p_workpiece uuid, p_operation uuid,
  p_expected_revision bigint default null, p_expected_hash text default null,
  p_content_hash text default null, p_bytes bigint default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare op tongs.script_publication_operations%rowtype; f tongs.workpiece_files%rowtype;
  fp text; result jsonb; key text; n bigint; prior jsonb;
begin
  perform tongs.require_account_admission(p_actor);
  -- Row locks make membership/admission changes serialize with publication.
  perform 1 from tongs.account_admissions where user_id=p_actor and effective_state='admitted' for share;
  if not found then raise exception 'account admission required' using errcode='42501'; end if;
  perform 1 from tongs.workspace_members where workspace_id=p_workspace and user_id=p_actor
    and role in ('owner','editor') for share;
  if not found then raise exception 'editor required' using errcode='42501'; end if;
  -- A parent lock also serializes initial publication when the script row is absent.
  perform 1 from tongs.episodes where id=p_workpiece and workspace_id=p_workspace
    and deleted_at is null and archived_at is null for update;
  if not found then raise exception 'active episode required' using errcode='42501'; end if;
  select * into op from tongs.script_publication_operations where operation_id=p_operation for update;
  if found and (op.actor_id<>p_actor or op.workspace_id<>p_workspace or op.workpiece_id<>p_workpiece) then
    raise exception 'operation identity conflict' using errcode='23505';
  end if;
  if p_command='prepare' then
    key:=format('workpieces/%s/script/publications/%s/script.md',p_workpiece,p_operation);
    fp:=encode(extensions.digest(convert_to(jsonb_build_array(p_actor,p_workspace,p_workpiece,
      p_expected_revision,p_expected_hash,p_content_hash,p_bytes,key)::text,'UTF8'),'sha256'),'hex');
    if op.operation_id is not null then
      if op.fingerprint<>fp then raise exception 'operation fingerprint conflict' using errcode='23505'; end if;
    else
      insert into tongs.script_publication_operations(operation_id,workspace_id,workpiece_id,actor_id,
        fingerprint,expected_revision,expected_hash,content_hash,byte_count,storage_key)
      values(p_operation,p_workspace,p_workpiece,p_actor,fp,p_expected_revision,p_expected_hash,p_content_hash,p_bytes,key)
      returning * into op;
    end if;
  elsif op.operation_id is null then
    return jsonb_build_object('state','absent','operation_id',p_operation);
  elsif p_command not in ('status','finalize','abandon') then
    raise exception 'invalid publication command' using errcode='22023';
  end if;
  if p_command='abandon' and op.state='prepared' then
    result:=jsonb_build_object('state','abandoned','operation_id',op.operation_id);
    update tongs.script_publication_operations set state='abandoned',receipt=result,completed_at=clock_timestamp()
      where operation_id=p_operation returning * into op;
  elsif p_command='finalize' and op.state='prepared' then
    select * into f from tongs.workpiece_files where workpiece_id=p_workpiece and path='script/script.md' for update;
    prior:=to_jsonb(f);
    if coalesce(f.revision,0)<>op.expected_revision or f.hash_value is distinct from op.expected_hash then
      result:=jsonb_build_object('state','conflict','operation_id',op.operation_id,'reason','canonical_basis_changed');
      update tongs.script_publication_operations set state='conflict',receipt=result,completed_at=clock_timestamp()
        where operation_id=p_operation returning * into op;
    else
      if f.hash_value=op.content_hash and f.bytes=op.byte_count then
        n:=f.revision;
      else
        perform set_config('tongs.script_publication_operation',p_operation::text,true);
        if f.workpiece_id is null then
          insert into tongs.workpiece_files(workpiece_id,path,file_type,content_type,bytes,hash_algo,hash_value,
            storage_bucket,storage_key,written_by_tool,written_by_tool_version,written_by_lane)
          values(p_workpiece,'script/script.md','script','text/markdown; charset=utf-8',op.byte_count,'sha256',op.content_hash,
            'forge-workpieces',op.storage_key,'hearth','atomic-script-v1','forge-managed') returning * into f;
        else
          update tongs.workpiece_files set bytes=op.byte_count,hash_value=op.content_hash,storage_key=op.storage_key,
            updated_at=clock_timestamp(),written_by_tool='hearth',written_by_tool_version='atomic-script-v1',written_by_lane='forge-managed'
          where workpiece_id=p_workpiece and path='script/script.md' returning * into f;
        end if;
        perform set_config('tongs.script_publication_operation','',true);
        n:=f.revision;
      end if;
      result:=jsonb_build_object('state','committed','operation_id',p_operation,'workspace_id',p_workspace,
        'workpiece_id',p_workpiece,'path','script/script.md','revision',n,'sha256',f.hash_value,'bytes',f.bytes,
        'storage_bucket',f.storage_bucket,'storage_key',f.storage_key,'updated_at',f.updated_at,
        'unchanged',n=op.expected_revision,'previous',prior);

      update tongs.script_publication_operations set state='committed',receipt=result,completed_at=clock_timestamp()
        where operation_id=p_operation returning * into op;
      insert into tongs.workpiece_events(workpiece_id,event_name,payload,correlation_id,
        written_by_tool,written_by_tool_version,written_by_lane)
      values(p_workpiece,'hearth.script.published.v2',result,p_operation::text,'tongs','atomic-script-v1','forge-managed');
    end if;
  end if;
  if op.state='prepared' then
    select * into f from tongs.workpiece_files where workpiece_id=p_workpiece and path='script/script.md';
  end if;
  return jsonb_build_object('state',op.state,'operation_id',op.operation_id,'storage_key',case when op.state='prepared' and f.revision=op.expected_revision and f.hash_value=op.expected_hash and f.hash_value=op.content_hash and f.bytes=op.byte_count then f.storage_key else op.storage_key end,
    'sha256',op.content_hash,'bytes',op.byte_count,'receipt',op.receipt);
end $$;

alter function tongs.guard_script_publication_operation() owner to postgres;
alter function tongs.guard_canonical_script_publication() owner to postgres;
alter function tongs.script_publication_command(text,uuid,uuid,uuid,uuid,bigint,text,text,bigint) owner to postgres;
revoke all on function tongs.guard_script_publication_operation(),tongs.guard_canonical_script_publication() from public,anon,authenticated,service_role;
revoke all on function tongs.script_publication_command(text,uuid,uuid,uuid,uuid,bigint,text,text,bigint) from public,anon,authenticated;
grant execute on function tongs.script_publication_command(text,uuid,uuid,uuid,uuid,bigint,text,text,bigint) to service_role;

comment on table tongs.script_publication_operations is
 'Immutable publication identity and terminal receipts. workpiece_files alone selects the current script. No cascading evidence deletion. Committed non-current objects retained at least 90 days; no automatic deletion is authorized by this migration.';

-- Existing explicit episode deletion is the exception to the recovery window.
-- Archive already prevents new finalization; terminal receipts survive deletion.
create function tongs.close_episode_script_publications(p_actor uuid,p_workspace uuid,p_workpiece uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare keys jsonb;
begin
  perform tongs.require_account_admission(p_actor);
  perform 1 from tongs.workspace_members where workspace_id=p_workspace and user_id=p_actor and role in ('owner','editor') for share;
  if not found then raise exception 'editor required' using errcode='42501'; end if;
  perform 1 from tongs.episodes where id=p_workpiece and workspace_id=p_workspace and archived_at is not null for update;
  if not found then raise exception 'archive required' using errcode='42501'; end if;
  update tongs.script_publication_operations set state='abandoned',completed_at=clock_timestamp(),
    receipt=jsonb_build_object('state','abandoned','operation_id',operation_id,'reason','episode_deleted')
    where workpiece_id=p_workpiece and workspace_id=p_workspace and state='prepared';
  select coalesce(jsonb_agg(distinct k),'[]'::jsonb) into keys from (
    select storage_key k from tongs.script_publication_operations where workpiece_id=p_workpiece and workspace_id=p_workspace
    union select receipt#>>'{previous,storage_key}' from tongs.script_publication_operations where workpiece_id=p_workpiece and workspace_id=p_workspace
  ) q where k is not null and k like 'workpieces/'||p_workpiece::text||'/%';
  return keys;
end $$;
alter function tongs.close_episode_script_publications(uuid,uuid,uuid) owner to postgres;
revoke all on function tongs.close_episode_script_publications(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function tongs.close_episode_script_publications(uuid,uuid,uuid) to service_role;

commit;
