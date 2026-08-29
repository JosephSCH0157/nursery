-- Phase 5A: revision/hash-bound Hearth Ready transition authority.

begin;

alter table tongs.workpiece_files
  add column if not exists revision bigint not null default 1;

alter table tongs.workpiece_files
  drop constraint if exists workpiece_files_revision_positive;
alter table tongs.workpiece_files
  add constraint workpiece_files_revision_positive check (revision > 0);

create or replace function tongs.workpiece_file_advance_revision()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, tongs
as $function$
begin
  new.revision := old.revision + 1;
  return new;
end;
$function$;

drop trigger if exists trg_workpiece_files_revision on tongs.workpiece_files;
create trigger trg_workpiece_files_revision
before update on tongs.workpiece_files
for each row execute function tongs.workpiece_file_advance_revision();

alter table tongs.workpiece_ready_script_meta
  add column if not exists script_revision bigint,
  add column if not exists script_hash text,
  add column if not exists transition_id uuid,
  add column if not exists publish_evidence jsonb;

alter table tongs.workpiece_ready_script_meta
  drop constraint if exists workpiece_ready_script_meta_revision_positive;
alter table tongs.workpiece_ready_script_meta
  add constraint workpiece_ready_script_meta_revision_positive
  check (script_revision is null or script_revision > 0);

alter table tongs.workpiece_ready_script_meta
  drop constraint if exists workpiece_ready_script_meta_hash_check;
alter table tongs.workpiece_ready_script_meta
  add constraint workpiece_ready_script_meta_hash_check
  check (script_hash is null or script_hash ~ '^[0-9a-f]{64}$');

create table if not exists tongs.workpiece_ready_transition_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null references tongs.episodes(id) on delete cascade,
  script_path text not null,
  script_revision bigint not null check (script_revision > 0),
  script_hash text not null check (script_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key text not null,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{32}$'),
  publish_evidence jsonb not null,
  transitioned_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint workpiece_ready_transition_requests_path_check
    check (script_path = 'script/script.md'),
  constraint workpiece_ready_transition_requests_idempotency_key_check
    check (length(btrim(idempotency_key)) between 8 and 200),
  constraint workpiece_ready_transition_requests_workspace_key
    unique (workspace_id, idempotency_key)
);

create index if not exists ready_transition_workpiece_revision_idx
  on tongs.workpiece_ready_transition_requests
  (workspace_id, workpiece_id, script_path, script_revision desc, created_at desc);

create unique index if not exists ready_script_meta_transition_id_uidx
  on tongs.workpiece_ready_script_meta (transition_id)
  where transition_id is not null;

alter table tongs.workpiece_ready_script_meta
  drop constraint if exists workpiece_ready_script_meta_transition_id_fkey;
alter table tongs.workpiece_ready_script_meta
  add constraint workpiece_ready_script_meta_transition_id_fkey
  foreign key (transition_id)
  references tongs.workpiece_ready_transition_requests(id)
  on delete set null;

create or replace function tongs.hearth_transition_script_ready(
  p_workspace_id uuid,
  p_workpiece_id uuid,
  p_script_path text,
  p_expected_script_revision bigint,
  p_expected_script_hash text,
  p_idempotency_key text,
  p_publish_evidence jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, tongs
as $function$
declare
  v_user_id uuid := auth.uid();
  v_path text := btrim(coalesce(p_script_path, ''));
  v_hash text := lower(btrim(coalesce(p_expected_script_hash, '')));
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_request_fingerprint text;
  v_episode tongs.episodes%rowtype;
  v_file tongs.workpiece_files%rowtype;
  v_existing tongs.workpiece_ready_transition_requests%rowtype;
  v_transition tongs.workpiece_ready_transition_requests%rowtype;
  v_ready tongs.workpiece_ready_script_meta%rowtype;
begin
  if v_user_id is null or p_workspace_id is null
    or not tongs.has_workspace_role(p_workspace_id, 'editor') then
    return jsonb_build_object('outcome', 'denied', 'ready', null, 'reason', 'editor_required');
  end if;

  if v_path <> 'script/script.md'
    or p_expected_script_revision is null or p_expected_script_revision <= 0
    or v_hash !~ '^[0-9a-f]{64}$'
    or length(v_key) < 8 or length(v_key) > 200
    or p_publish_evidence is null
    or jsonb_typeof(p_publish_evidence) <> 'object'
    or p_publish_evidence->>'transition' <> 'hearth.script.published.v1'
    or p_publish_evidence->>'script_path' is distinct from v_path
    or (p_publish_evidence->>'script_revision')::bigint is distinct from p_expected_script_revision
    or lower(coalesce(p_publish_evidence->>'script_hash', '')) is distinct from v_hash
    or p_publish_evidence#>>'{validation,validator_version}' <> 'shared-script-tags-v1'
    or coalesce((p_publish_evidence#>>'{validation,ok}')::boolean, false) is not true
    or coalesce((p_publish_evidence#>>'{validation,issue_count}')::integer, -1) <> 0 then
    return jsonb_build_object('outcome', 'conflict', 'ready', null, 'reason', 'invalid_publish_evidence');
  end if;

  v_request_fingerprint := md5(concat_ws(chr(31),
    p_workspace_id::text, p_workpiece_id::text, v_path,
    p_expected_script_revision::text, v_hash, p_publish_evidence::text));

  select * into v_existing
  from tongs.workpiece_ready_transition_requests
  where workspace_id = p_workspace_id and idempotency_key = v_key;
  if found then
    if v_existing.request_fingerprint <> v_request_fingerprint then
      return jsonb_build_object('outcome', 'conflict', 'ready', null, 'reason', 'idempotency_reuse');
    end if;
    select * into v_ready from tongs.workpiece_ready_script_meta
    where workpiece_id = v_existing.workpiece_id and script_path = v_existing.script_path;
    return jsonb_build_object('outcome', 'duplicate', 'ready', to_jsonb(v_ready), 'reason', null);
  end if;

  select * into v_episode from tongs.episodes
  where id = p_workpiece_id and workspace_id = p_workspace_id;
  if not found then
    if exists (select 1 from tongs.episodes where id = p_workpiece_id) then
      return jsonb_build_object('outcome', 'denied', 'ready', null, 'reason', 'workspace_mismatch');
    end if;
    return jsonb_build_object('outcome', 'not_found', 'ready', null, 'reason', 'workpiece_not_found');
  end if;

  select * into v_file from tongs.workpiece_files
  where workpiece_id = p_workpiece_id and path = v_path
  for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found', 'ready', null, 'reason', 'script_not_found');
  end if;

  select * into v_existing
  from tongs.workpiece_ready_transition_requests
  where workspace_id = p_workspace_id and idempotency_key = v_key;
  if found then
    if v_existing.request_fingerprint <> v_request_fingerprint then
      return jsonb_build_object('outcome', 'conflict', 'ready', null, 'reason', 'idempotency_reuse');
    end if;
    select * into v_ready from tongs.workpiece_ready_script_meta
    where workpiece_id = v_existing.workpiece_id and script_path = v_existing.script_path;
    return jsonb_build_object('outcome', 'duplicate', 'ready', to_jsonb(v_ready), 'reason', null);
  end if;

  if v_file.revision <> p_expected_script_revision then
    return jsonb_build_object(
      'outcome', 'stale', 'ready', null, 'reason', 'script_revision_mismatch',
      'canonical_script', jsonb_build_object('revision', v_file.revision, 'hash', v_file.hash_value));
  end if;
  if lower(v_file.hash_value) <> v_hash then
    return jsonb_build_object(
      'outcome', 'conflict', 'ready', null, 'reason', 'script_hash_mismatch',
      'canonical_script', jsonb_build_object('revision', v_file.revision, 'hash', v_file.hash_value));
  end if;

  insert into tongs.workpiece_ready_transition_requests (
    workspace_id, workpiece_id, script_path, script_revision, script_hash,
    idempotency_key, request_fingerprint, publish_evidence, transitioned_by
  ) values (
    p_workspace_id, p_workpiece_id, v_path, p_expected_script_revision, v_hash,
    v_key, v_request_fingerprint, p_publish_evidence, v_user_id
  ) returning * into v_transition;

  insert into tongs.workpiece_ready_script_meta (
    workspace_id, workpiece_id, script_path, marked_ready_by, marked_ready_at,
    updated_by, script_revision, script_hash, transition_id, publish_evidence
  ) values (
    p_workspace_id, p_workpiece_id, v_path, v_user_id, now(),
    v_user_id, v_file.revision, lower(v_file.hash_value), v_transition.id, p_publish_evidence
  )
  on conflict (workpiece_id, script_path) do update set
    workspace_id = excluded.workspace_id,
    marked_ready_by = excluded.marked_ready_by,
    marked_ready_at = excluded.marked_ready_at,
    updated_by = excluded.updated_by,
    script_revision = excluded.script_revision,
    script_hash = excluded.script_hash,
    transition_id = excluded.transition_id,
    publish_evidence = excluded.publish_evidence
  returning * into v_ready;

  delete from tongs.workpiece_ready_script_meta
  where workspace_id = p_workspace_id and workpiece_id = p_workpiece_id and script_path <> v_path;

  return jsonb_build_object('outcome', 'saved', 'ready', to_jsonb(v_ready), 'reason', null);
exception
  when invalid_text_representation then
    return jsonb_build_object('outcome', 'conflict', 'ready', null, 'reason', 'invalid_publish_evidence');
end;
$function$;

create or replace view tongs.current_workpiece_ready_scripts
with (security_invoker = true)
as
select
  m.workspace_id,
  m.workpiece_id,
  m.script_path,
  m.script_revision,
  m.script_hash,
  m.transition_id,
  m.marked_ready_by,
  m.marked_ready_at,
  m.publish_evidence,
  f.updated_at as script_updated_at
from tongs.workpiece_ready_script_meta m
join tongs.episodes e
  on e.id = m.workpiece_id and e.workspace_id = m.workspace_id
join tongs.workpiece_files f
  on f.workpiece_id = m.workpiece_id and f.path = m.script_path
where e.archived_at is null
  and m.script_revision is not null
  and m.script_hash is not null
  and m.transition_id is not null
  and m.script_revision = f.revision
  and m.script_hash = lower(f.hash_value);

alter table tongs.workpiece_ready_transition_requests enable row level security;

create policy ready_transition_requests_select_if_workspace_viewer
on tongs.workpiece_ready_transition_requests
for select to authenticated
using (tongs.has_workspace_role(workspace_id, 'viewer'));

-- Ready transitions are RPC-only. Historical rows are readable to members but
-- cannot be forged, changed, or deleted through direct authenticated DML.
revoke insert, update, delete on tongs.workpiece_ready_script_meta from authenticated;
revoke insert, update, delete on tongs.workpiece_ready_transition_requests from authenticated;
grant select on tongs.workpiece_ready_transition_requests to authenticated;
grant select on tongs.current_workpiece_ready_scripts to authenticated;

-- File identity is server-authored. Clients may read the revision/hash but may
-- not bypass Tongs commit authority with direct table writes.
revoke insert, update, delete on tongs.workpiece_files from authenticated;
grant select on tongs.workpiece_files to authenticated;

alter function tongs.workpiece_file_advance_revision() owner to postgres;
alter function tongs.hearth_transition_script_ready(uuid, uuid, text, bigint, text, text, jsonb) owner to postgres;
revoke all on function tongs.workpiece_file_advance_revision() from public, anon, authenticated;
revoke all on function tongs.hearth_transition_script_ready(uuid, uuid, text, bigint, text, text, jsonb) from public, anon;
grant execute on function tongs.hearth_transition_script_ready(uuid, uuid, text, bigint, text, text, jsonb) to authenticated;

comment on column tongs.workpiece_files.revision is 'Server-controlled monotonic file revision used for optimistic lifecycle transitions.';
comment on table tongs.workpiece_ready_transition_requests is 'Append-only accepted Hearth Ready transitions and idempotency authority.';
comment on view tongs.current_workpiece_ready_scripts is 'Ready contracts whose stored revision/hash exactly match the current canonical script file.';

commit;
