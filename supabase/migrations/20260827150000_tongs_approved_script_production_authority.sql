-- Slice 3: immutable approved-script production authority.
-- A mutable workpiece file is an approval input only. Ready and capture consume
-- an explicit immutable approval identity and never re-resolve production text.

begin;

create or replace function tongs.normalize_script_approval_text(p_text text)
returns text
language sql
immutable
strict
set search_path = pg_catalog, tongs
as $function$
  select normalize(
    replace(replace(
      case when left(p_text, 1) = U&'\FEFF' then substr(p_text, 2) else p_text end,
      E'\r\n', E'\n'), E'\r', E'\n'),
    NFC
  );
$function$;

alter table tongs.workpiece_ready_transition_requests
  add column if not exists script_approval_id uuid,
  add column if not exists script_approval_revision bigint,
  add column if not exists script_approval_hash text;

alter table tongs.workpiece_ready_script_meta
  add column if not exists script_approval_id uuid,
  add column if not exists script_approval_revision bigint,
  add column if not exists script_approval_hash text;

alter table tongs.anvil_capture_authorities
  add column if not exists script_approval_id uuid,
  add column if not exists script_approval_revision bigint,
  add column if not exists script_approval_hash text;

update tongs.workpiece_ready_transition_requests r
set script_approval_id = a.id,
    script_approval_revision = a.approval_revision,
    script_approval_hash = a.script_content_hash
from tongs.script_approval_revisions a
where r.script_approval_id is null
  and a.workspace_id = r.workspace_id
  and a.workpiece_id = r.workpiece_id
  and a.source_file_path = r.script_path
  and a.source_file_revision = r.script_revision
  and a.script_content_hash = r.script_hash
  and a.created_at <= r.created_at
  and not exists (
    select 1 from tongs.script_approval_revisions other
    where other.workspace_id = r.workspace_id
      and other.workpiece_id = r.workpiece_id
      and other.source_file_path = r.script_path
      and other.source_file_revision = r.script_revision
      and other.script_content_hash = r.script_hash
      and other.created_at <= r.created_at
      and other.id <> a.id
  );

update tongs.workpiece_ready_script_meta m
set script_approval_id = r.script_approval_id,
    script_approval_revision = r.script_approval_revision,
    script_approval_hash = r.script_approval_hash
from tongs.workpiece_ready_transition_requests r
where m.transition_id = r.id and m.script_approval_id is null;

-- This is a one-time, exact-evidence enrichment of rows made immutable by the
-- preceding capture-authority migration. Keep the guard disabled only around
-- this backfill; PostgreSQL transactional DDL restores it if the update fails.
alter table tongs.anvil_capture_authorities
  disable trigger trg_anvil_capture_authority_immutable;

update tongs.anvil_capture_authorities c
set script_approval_id = r.script_approval_id,
    script_approval_revision = r.script_approval_revision,
    script_approval_hash = r.script_approval_hash
from tongs.workpiece_ready_transition_requests r
where c.ready_transition_id = r.id and c.script_approval_id is null;

alter table tongs.anvil_capture_authorities
  enable trigger trg_anvil_capture_authority_immutable;

alter table tongs.workpiece_ready_transition_requests
  add constraint ready_transition_approval_tuple_shape check (
    (script_approval_id is null and script_approval_revision is null and script_approval_hash is null)
    or (script_approval_id is not null and script_approval_revision > 0 and script_approval_hash ~ '^[0-9a-f]{64}$')
  ),
  add constraint ready_transition_approval_fkey foreign key
    (script_approval_id, workspace_id, workpiece_id, script_approval_revision)
    references tongs.script_approval_revisions(id, workspace_id, workpiece_id, approval_revision);

alter table tongs.workpiece_ready_script_meta
  add constraint ready_meta_approval_tuple_shape check (
    (script_approval_id is null and script_approval_revision is null and script_approval_hash is null)
    or (script_approval_id is not null and script_approval_revision > 0 and script_approval_hash ~ '^[0-9a-f]{64}$')
  ),
  add constraint ready_meta_approval_fkey foreign key
    (script_approval_id, workspace_id, workpiece_id, script_approval_revision)
    references tongs.script_approval_revisions(id, workspace_id, workpiece_id, approval_revision);

alter table tongs.anvil_capture_authorities
  add constraint capture_approval_tuple_shape check (
    (script_approval_id is null and script_approval_revision is null and script_approval_hash is null)
    or (script_approval_id is not null and script_approval_revision > 0 and script_approval_hash ~ '^[0-9a-f]{64}$')
  ),
  add constraint capture_approval_fkey foreign key
    (script_approval_id, workspace_id, workpiece_id, script_approval_revision)
    references tongs.script_approval_revisions(id, workspace_id, workpiece_id, approval_revision);

create index if not exists ready_transition_approval_idx
  on tongs.workpiece_ready_transition_requests(workspace_id, workpiece_id, script_approval_id, created_at desc);
create index if not exists anvil_capture_approval_idx
  on tongs.anvil_capture_authorities(workspace_id, workpiece_id, script_approval_id, established_at desc);

create or replace view tongs.current_workpiece_ready_scripts
with (security_invoker = true)
as select
  m.workspace_id,m.workpiece_id,m.script_path,m.script_revision,m.script_hash,
  m.transition_id,m.marked_ready_by,m.marked_ready_at,m.publish_evidence,
  a.created_at as script_updated_at,
  m.script_approval_id,m.script_approval_revision,m.script_approval_hash,
  a.created_at as script_approved_at
from tongs.workpiece_ready_script_meta m
join tongs.episodes e on e.id=m.workpiece_id and e.workspace_id=m.workspace_id
join tongs.script_approval_revisions a
  on a.id=m.script_approval_id and a.workspace_id=m.workspace_id and a.workpiece_id=m.workpiece_id
  and a.approval_revision=m.script_approval_revision and a.script_content_hash=m.script_approval_hash
where e.archived_at is null and m.transition_id is not null;

create or replace function tongs.approve_canonical_script_v2(
  p_workspace_id uuid,
  p_workpiece_id uuid,
  p_expected_current_approval_revision bigint,
  p_expected_source_file_revision bigint,
  p_expected_source_content_hash text,
  p_script_text text,
  p_creator_version_label text,
  p_operation_id text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, tongs
as $function$
declare
  v_user uuid := auth.uid();
  v_file tongs.workpiece_files%rowtype;
  v_text text;
  v_hash text;
  v_result jsonb;
  v_receipt tongs.hearth_authority_operation_receipts%rowtype;
  v_prior tongs.script_approval_revisions%rowtype;
begin
  if v_user is null or not tongs.has_workspace_role(p_workspace_id, 'editor') then
    return jsonb_build_object('disposition','denied','reason','editor_required');
  end if;
  if not exists(select 1 from tongs.episodes where id=p_workpiece_id and workspace_id=p_workspace_id) then
    return jsonb_build_object('disposition','not_found','reason','episode_membership_invalid');
  end if;
  select * into v_receipt from tongs.hearth_authority_operation_receipts where operation_id=p_operation_id;
  if found then
    select * into v_prior from tongs.script_approval_revisions where id=v_receipt.result_script_approval_id;
    if found and v_receipt.workspace_id=p_workspace_id and v_receipt.workpiece_id=p_workpiece_id
      and v_prior.source_file_revision=p_expected_source_file_revision
      and v_prior.script_content_hash=lower(p_expected_source_content_hash) then
      return v_receipt.immutable_result_json;
    end if;
    return jsonb_build_object('disposition','operation_identity_conflict');
  end if;
  select * into v_file from tongs.workpiece_files
    where workpiece_id=p_workpiece_id and path='script/script.md' for update;
  if not found then return jsonb_build_object('disposition','not_found','reason','script_not_found'); end if;
  if v_file.revision <> p_expected_source_file_revision then
    return jsonb_build_object('disposition','stale_source','reason','source_revision_changed','current_source_revision',v_file.revision);
  end if;
  v_hash := lower(coalesce(v_file.hash_value,''));
  if v_hash <> lower(btrim(coalesce(p_expected_source_content_hash,''))) then
    return jsonb_build_object('disposition','stale_source','reason','source_hash_changed','current_source_hash',v_hash);
  end if;
  v_text := tongs.normalize_script_approval_text(p_script_text);
  if encode(extensions.digest(convert_to(v_text,'UTF8'),'sha256'),'hex') <> v_hash then
    return jsonb_build_object('disposition','stale_source','reason','source_bytes_changed');
  end if;
  select tongs.commit_script_approval_snapshot(
    p_workspace_id,p_workpiece_id,p_expected_current_approval_revision,
    'script/script.md',v_file.revision,v_text,'forge.script-approval.v2',
    p_creator_version_label,p_operation_id,v_user
  ) into v_result;
  return v_result;
end;
$function$;

-- Ready consumes an explicit approval. File tuple fields are compatibility
-- projections copied from that approval, never caller-selected authority.
create or replace function tongs.hearth_transition_approved_script_ready(
  p_workspace_id uuid,p_workpiece_id uuid,p_script_approval_id uuid,
  p_idempotency_key text,p_publish_evidence jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $function$
declare
  v_user uuid:=auth.uid(); v_key text:=btrim(coalesce(p_idempotency_key,''));
  v_approval tongs.script_approval_revisions%rowtype;
  v_existing tongs.workpiece_ready_transition_requests%rowtype;
  v_transition tongs.workpiece_ready_transition_requests%rowtype;
  v_ready tongs.workpiece_ready_script_meta%rowtype; v_fingerprint text;
begin
  if v_user is null or not tongs.has_workspace_role(p_workspace_id,'editor') then
    return jsonb_build_object('outcome','denied','reason','editor_required','ready',null);
  end if;
  if length(v_key) not between 8 and 200 or jsonb_typeof(p_publish_evidence)<>'object' then
    return jsonb_build_object('outcome','conflict','reason','invalid_publish_evidence','ready',null);
  end if;
  select * into v_approval from tongs.script_approval_revisions
    where id=p_script_approval_id and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
  if not found then return jsonb_build_object('outcome','not_found','reason','approval_not_found','ready',null); end if;
  if p_publish_evidence->>'transition' is distinct from 'hearth.approved-script.ready.v2'
    or p_publish_evidence->>'script_approval_id' is distinct from v_approval.id::text
    or lower(coalesce(p_publish_evidence->>'script_approval_hash','')) is distinct from v_approval.script_content_hash then
    return jsonb_build_object('outcome','conflict','reason','approval_evidence_mismatch','ready',null);
  end if;
  v_fingerprint:=md5(concat_ws(chr(31),p_workspace_id::text,p_workpiece_id::text,v_approval.id::text,v_approval.approval_revision::text,v_approval.script_content_hash,p_publish_evidence::text));
  select * into v_existing from tongs.workpiece_ready_transition_requests where workspace_id=p_workspace_id and idempotency_key=v_key;
  if found then
    if v_existing.request_fingerprint<>v_fingerprint then return jsonb_build_object('outcome','conflict','reason','idempotency_reuse','ready',null); end if;
    select * into v_ready from tongs.workpiece_ready_script_meta where transition_id=v_existing.id;
    return jsonb_build_object('outcome','duplicate','reason',null,'ready',to_jsonb(v_ready));
  end if;
  insert into tongs.workpiece_ready_transition_requests(workspace_id,workpiece_id,script_path,script_revision,script_hash,
    script_approval_id,script_approval_revision,script_approval_hash,idempotency_key,request_fingerprint,publish_evidence,transitioned_by)
  values(p_workspace_id,p_workpiece_id,v_approval.source_file_path,v_approval.source_file_revision,v_approval.script_content_hash,
    v_approval.id,v_approval.approval_revision,v_approval.script_content_hash,v_key,v_fingerprint,p_publish_evidence,v_user)
  returning * into v_transition;
  insert into tongs.workpiece_ready_script_meta(workspace_id,workpiece_id,script_path,marked_ready_by,marked_ready_at,updated_by,
    script_revision,script_hash,script_approval_id,script_approval_revision,script_approval_hash,transition_id,publish_evidence)
  values(p_workspace_id,p_workpiece_id,v_approval.source_file_path,v_user,now(),v_user,v_approval.source_file_revision,v_approval.script_content_hash,
    v_approval.id,v_approval.approval_revision,v_approval.script_content_hash,v_transition.id,p_publish_evidence)
  on conflict(workpiece_id,script_path) do update set workspace_id=excluded.workspace_id,marked_ready_by=excluded.marked_ready_by,
    marked_ready_at=excluded.marked_ready_at,updated_by=excluded.updated_by,script_revision=excluded.script_revision,script_hash=excluded.script_hash,
    script_approval_id=excluded.script_approval_id,script_approval_revision=excluded.script_approval_revision,
    script_approval_hash=excluded.script_approval_hash,transition_id=excluded.transition_id,publish_evidence=excluded.publish_evidence
  returning * into v_ready;
  return jsonb_build_object('outcome','saved','reason',null,'ready',to_jsonb(v_ready));
end;
$function$;

-- Capture establishment retains its existing signature for callers but now
-- refuses legacy Ready rows without a proven approval identity.
create or replace function tongs.establish_anvil_capture_authority(
  p_workspace_id uuid,p_workpiece_id uuid,p_capture_session_id uuid,p_operation_key text,
  p_recording_session_id uuid default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $function$
declare v_user uuid:=auth.uid();v_key text:=btrim(coalesce(p_operation_key,''));v_ready record;
  v_existing tongs.anvil_capture_authorities%rowtype;v_saved tongs.anvil_capture_authorities%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||v_key,0));
  if v_user is null or not tongs.has_workspace_role(p_workspace_id,'editor') then return jsonb_build_object('outcome','denied','reason','editor_required','capture_authority',null); end if;
  if length(v_key) not between 8 and 200 then return jsonb_build_object('outcome','conflict','reason','operation_key_invalid','capture_authority',null); end if;
  select * into v_existing from tongs.anvil_capture_authorities where workspace_id=p_workspace_id and operation_key=v_key;
  if found then
    if v_existing.workpiece_id=p_workpiece_id and v_existing.capture_session_id=p_capture_session_id then return jsonb_build_object('outcome','duplicate','reason',null,'capture_authority',to_jsonb(v_existing)); end if;
    return jsonb_build_object('outcome','conflict','reason','operation_key_reused','capture_authority',null);
  end if;
  if not exists(select 1 from tongs.episodes where id=p_workpiece_id and workspace_id=p_workspace_id and archived_at is null) then return jsonb_build_object('outcome','not_found','reason','episode_membership_invalid','capture_authority',null); end if;
  select transition_id,script_path,script_revision,lower(script_hash) script_hash,script_approval_id,script_approval_revision,lower(script_approval_hash) script_approval_hash
    into v_ready from tongs.current_workpiece_ready_scripts where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and script_path='script/script.md';
  if not found or v_ready.script_approval_id is null then return jsonb_build_object('outcome','conflict','reason','approved_ready_script_required','capture_authority',null); end if;
  if p_recording_session_id is not null and not exists(select 1 from tongs.recording_sessions where id=p_recording_session_id and workspace_id=p_workspace_id) then return jsonb_build_object('outcome','conflict','reason','recording_session_mismatch','capture_authority',null); end if;
  insert into tongs.anvil_capture_authorities(capture_session_id,workspace_id,workpiece_id,recording_session_id,ready_transition_id,
    script_path,script_revision,script_hash,script_approval_id,script_approval_revision,script_approval_hash,operation_key,provenance,established_by)
  values(p_capture_session_id,p_workspace_id,p_workpiece_id,p_recording_session_id,v_ready.transition_id,v_ready.script_path,v_ready.script_revision,v_ready.script_hash,
    v_ready.script_approval_id,v_ready.script_approval_revision,v_ready.script_approval_hash,v_key,'live_established',v_user) returning * into v_saved;
  return jsonb_build_object('outcome','established','reason',null,'capture_authority',to_jsonb(v_saved));
exception when unique_violation then
  select * into v_existing from tongs.anvil_capture_authorities where capture_session_id=p_capture_session_id;
  if found and v_existing.workspace_id=p_workspace_id and v_existing.workpiece_id=p_workpiece_id and v_existing.operation_key=v_key then return jsonb_build_object('outcome','duplicate','reason',null,'capture_authority',to_jsonb(v_existing)); end if;
  return jsonb_build_object('outcome','conflict','reason','capture_session_reused','capture_authority',null);
end;
$function$;

grant execute on function tongs.approve_canonical_script_v2(uuid,uuid,bigint,bigint,text,text,text,text) to authenticated,service_role;
grant execute on function tongs.hearth_transition_approved_script_ready(uuid,uuid,uuid,text,jsonb) to authenticated,service_role;
revoke all on function tongs.approve_canonical_script_v2(uuid,uuid,bigint,bigint,text,text,text,text) from public,anon;
revoke all on function tongs.hearth_transition_approved_script_ready(uuid,uuid,uuid,text,jsonb) from public,anon;
revoke execute on function tongs.hearth_transition_script_ready(uuid,uuid,text,bigint,text,text,jsonb) from authenticated;
alter function tongs.approve_canonical_script_v2(uuid,uuid,bigint,bigint,text,text,text,text) owner to postgres;
alter function tongs.hearth_transition_approved_script_ready(uuid,uuid,uuid,text,jsonb) owner to postgres;
alter function tongs.establish_anvil_capture_authority(uuid,uuid,uuid,text,uuid) owner to postgres;

commit;
