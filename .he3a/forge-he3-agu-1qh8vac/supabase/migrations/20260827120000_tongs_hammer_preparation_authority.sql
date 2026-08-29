begin;

alter table tongs.canonical_recordings
  add column if not exists source_kind text null,
  add column if not exists source_authority_id uuid null,
  add column if not exists source_capture_authority_id uuid null references tongs.anvil_capture_authorities(id) on delete restrict;

alter table tongs.canonical_recordings
  drop constraint if exists canonical_recordings_source_kind_check;
alter table tongs.canonical_recordings
  add constraint canonical_recordings_source_kind_check
  check (source_kind is null or source_kind in ('anvil_capture','hammer_import'));

create index if not exists canonical_recordings_source_authority_idx
  on tongs.canonical_recordings(workspace_id, source_kind, source_authority_id)
  where source_authority_id is not null;

-- Preserve only provenance that is provable from exact persisted media evidence.
update tongs.canonical_recordings cr set source_kind='anvil_capture',source_authority_id=c.id,
  source_capture_authority_id=c.capture_authority_id
from tongs.anvil_recording_completion_requests c
join tongs.anvil_recording_keep_requests k on k.completion_id=c.id
where cr.source_kind is null and c.workspace_id=cr.workspace_id and c.workpiece_id=cr.workpiece_id
  and c.media_path=cr.media_path
  and (cr.anvil_capture_session_id is null or cr.anvil_capture_session_id=c.capture_session_id::text)
  and 1=(select count(*) from tongs.anvil_recording_completion_requests c2
    join tongs.anvil_recording_keep_requests k2 on k2.completion_id=c2.id
    where c2.workspace_id=cr.workspace_id and c2.workpiece_id=cr.workpiece_id and c2.media_path=cr.media_path);

update tongs.canonical_recordings cr set source_kind='hammer_import',source_authority_id=h.id
from tongs.hammer_recording_import_requests h
where cr.source_kind is null and h.state='committed' and h.workspace_id=cr.workspace_id
  and h.workpiece_id=cr.workpiece_id and h.media_path=cr.media_path
  and 1=(select count(*) from tongs.hammer_recording_import_requests h2 where h2.state='committed'
    and h2.workspace_id=cr.workspace_id and h2.workpiece_id=cr.workpiece_id and h2.media_path=cr.media_path);

create or replace function tongs.guard_canonical_recording_source_identity()
returns trigger language plpgsql set search_path=pg_catalog,tongs as $$
begin
  if new.source_kind is distinct from old.source_kind
    or new.source_authority_id is distinct from old.source_authority_id
    or new.source_capture_authority_id is distinct from old.source_capture_authority_id then
    raise exception using errcode='55000',message='canonical recording source authority is immutable';
  end if;
  return new;
end $$;
create trigger trg_canonical_recording_source_identity
before update on tongs.canonical_recordings
for each row execute function tongs.guard_canonical_recording_source_identity();

create table tongs.hammer_preparation_attempts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
  workpiece_id uuid not null references tongs.episodes(id) on delete restrict,
  canonical_recording_id uuid not null references tongs.canonical_recordings(id) on delete restrict,
  recording_revision_id uuid not null references tongs.recording_revisions(id) on delete restrict,
  source_kind text not null check (source_kind in ('anvil_capture','hammer_import','legacy_unresolved')),
  source_authority_id uuid null,
  source_capture_authority_id uuid null references tongs.anvil_capture_authorities(id) on delete restrict,
  media_path text not null check (length(btrim(media_path)) > 0),
  media_id text not null check (length(btrim(media_id)) > 0),
  media_hash text null check (media_hash is null or media_hash ~ '^[0-9a-f]{64}$'),
  transcript_policy text not null default 'reuse_only' check (transcript_policy in ('reuse_only','allow_ai_fallback')),
  state text not null default 'reserved' check (state in (
    'reserved','resolving_recording','resolving_transcript','awaiting_transcript_choice',
    'transcribing','hydrating','ready','recoverable_failure','blocked','superseded'
  )),
  state_version bigint not null default 1 check (state_version > 0),
  transcript_job_id uuid null references tongs.workpiece_jobs(id) on delete set null,
  transcript_artifact_path text null,
  failure_code text null,
  failure_detail text null,
  operation_key text not null check (length(btrim(operation_key)) between 8 and 200),
  request_fingerprint text not null check (length(request_fingerprint) = 32),
  lease_owner text null,
  lease_expires_at timestamptz null,
  heartbeat_at timestamptz null,
  retry_count integer not null default 0 check (retry_count >= 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null,
  failed_at timestamptz null,
  constraint hammer_preparation_workspace_operation_key unique(workspace_id, operation_key)
);

create index hammer_preparation_workpiece_created_idx
  on tongs.hammer_preparation_attempts(workspace_id, workpiece_id, created_at desc);
create index hammer_preparation_recording_revision_idx
  on tongs.hammer_preparation_attempts(canonical_recording_id, recording_revision_id, created_at desc);
create unique index hammer_preparation_one_active_revision_idx
  on tongs.hammer_preparation_attempts(recording_revision_id)
  where state in ('reserved','resolving_recording','resolving_transcript','awaiting_transcript_choice','transcribing','hydrating');

create table tongs.hammer_open_operation_receipts (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
  workpiece_id uuid not null references tongs.episodes(id) on delete restrict,
  operation_key text not null, request_fingerprint text not null check(length(request_fingerprint)=32),
  preparation_attempt_id uuid not null references tongs.hammer_preparation_attempts(id) on delete restrict,
  opened_by uuid not null references auth.users(id), opened_at timestamptz not null default now(),
  constraint hammer_open_receipt_workspace_operation_key unique(workspace_id,operation_key)
);
alter table tongs.hammer_open_operation_receipts enable row level security;
create policy hammer_open_receipt_select_if_workspace_viewer on tongs.hammer_open_operation_receipts
  for select to authenticated using(tongs.has_workspace_role(workspace_id,'viewer'));
revoke insert,update,delete on tongs.hammer_open_operation_receipts from authenticated;
grant select on tongs.hammer_open_operation_receipts to authenticated;
grant all on tongs.hammer_open_operation_receipts to service_role;

create or replace function tongs.guard_hammer_preparation_identity()
returns trigger language plpgsql set search_path=pg_catalog,tongs as $$
begin
  if new.workspace_id<>old.workspace_id or new.workpiece_id<>old.workpiece_id
    or new.canonical_recording_id<>old.canonical_recording_id
    or new.recording_revision_id<>old.recording_revision_id
    or new.source_kind<>old.source_kind
    or new.source_authority_id is distinct from old.source_authority_id
    or new.source_capture_authority_id is distinct from old.source_capture_authority_id
    or new.media_path<>old.media_path or new.media_id<>old.media_id
    or new.media_hash is distinct from old.media_hash
    or new.operation_key<>old.operation_key or new.request_fingerprint<>old.request_fingerprint
    or new.created_by<>old.created_by or new.created_at<>old.created_at then
    raise exception using errcode='55000',message='hammer preparation identity is immutable';
  end if;
  new.updated_at:=now();
  new.state_version:=old.state_version+1;
  return new;
end $$;
create trigger trg_hammer_preparation_identity
before update on tongs.hammer_preparation_attempts
for each row execute function tongs.guard_hammer_preparation_identity();

alter table tongs.hammer_preparation_attempts enable row level security;
create policy hammer_preparation_select_if_workspace_viewer
on tongs.hammer_preparation_attempts for select to authenticated
using (tongs.has_workspace_role(workspace_id,'viewer'));
revoke insert,update,delete on tongs.hammer_preparation_attempts from authenticated;
grant select on tongs.hammer_preparation_attempts to authenticated;
grant all on tongs.hammer_preparation_attempts to service_role;

create or replace function tongs.open_hammer_authority(
  p_workspace_id uuid,p_workpiece_id uuid,p_operation_key text,p_transcript_policy text default 'reuse_only',
  p_revision_label text default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare
  v_user uuid:=auth.uid(); v_key text:=btrim(coalesce(p_operation_key,''));
  v_policy text:=btrim(coalesce(p_transcript_policy,'reuse_only')); v_fingerprint text;
  v_existing tongs.hammer_preparation_attempts%rowtype; v_attempt tongs.hammer_preparation_attempts%rowtype; v_receipt record;
  v_episode tongs.episodes%rowtype; v_canonical tongs.canonical_recordings%rowtype;
  v_revision tongs.recording_revisions%rowtype; v_take record; v_capture uuid; v_media_id text;
begin
  if v_user is null or not tongs.has_workspace_role(p_workspace_id,'editor') then
    return jsonb_build_object('outcome','denied','reason','editor_required');
  end if;
  select * into v_episode from tongs.episodes where id=p_workpiece_id and workspace_id=p_workspace_id for update;
  if not found then return jsonb_build_object('outcome','not_found','reason','workpiece_membership_mismatch'); end if;
  if length(v_key) not between 8 and 200 or v_policy not in ('reuse_only','allow_ai_fallback') then
    return jsonb_build_object('outcome','conflict','reason','invalid_open_request');
  end if;
  v_fingerprint:=md5(concat_ws('|',p_workspace_id,p_workpiece_id,v_policy,coalesce(p_revision_label,'')));
  select r.request_fingerprint receipt_fingerprint,a.* into v_receipt from tongs.hammer_open_operation_receipts r
    join tongs.hammer_preparation_attempts a on a.id=r.preparation_attempt_id
    where r.workspace_id=p_workspace_id and r.operation_key=v_key;
  if found then
    if v_receipt.receipt_fingerprint<>v_fingerprint then
      return jsonb_build_object('outcome','conflict','reason','hammer_open_idempotency_conflict');
    end if;
    select * into v_canonical from tongs.canonical_recordings where id=v_receipt.canonical_recording_id;
    select * into v_revision from tongs.recording_revisions where id=v_receipt.recording_revision_id;
    return jsonb_build_object('outcome','duplicate','canonical_recording',to_jsonb(v_canonical),
      'revision',to_jsonb(v_revision),'preparation_attempt',to_jsonb(v_receipt)-'receipt_fingerprint');
  end if;

  if v_episode.canonical_recording_id is not null then
    select * into v_canonical from tongs.canonical_recordings
      where id=v_episode.canonical_recording_id and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
    if not found then return jsonb_build_object('outcome','blocked','reason','canonical_recording_pointer_invalid'); end if;
  else
    select r.*,c.capture_authority_id into v_take
      from tongs.current_workpiece_recorded_takes r
      left join tongs.anvil_recording_completion_requests c on c.id=r.completion_id
      where r.workspace_id=p_workspace_id and r.workpiece_id=p_workpiece_id and r.keep_id is not null
      order by r.kept_at desc nulls last,r.completed_at desc,r.source_authority_id desc limit 1;
    if not found then return jsonb_build_object('outcome','blocked','reason','canonical_recording_missing_take'); end if;
    v_capture:=v_take.capture_authority_id;
    v_media_id:=case when v_take.source_kind='anvil_capture'
      then 'anvil-completion:'||v_take.source_authority_id::text
      else 'hammer-import:'||v_take.source_authority_id::text end;
    insert into tongs.canonical_recordings(workspace_id,workpiece_id,status,kept_take_event_id,media_path,
      media_content_type,media_bytes,recording_session_id,anvil_capture_session_id,media_id,media_signature,
      source_kind,source_authority_id,source_capture_authority_id,created_by,updated_by)
    values(p_workspace_id,p_workpiece_id,'draft',null,v_take.media_path,v_take.media_content_type,v_take.media_bytes,
      v_take.recording_session_id,v_take.capture_session_id::text,v_media_id,v_take.media_hash,
      v_take.source_kind,v_take.source_authority_id,v_capture,v_user,v_user)
    returning * into v_canonical;
    update tongs.episodes set canonical_recording_id=v_canonical.id,updated_at=now() where id=p_workpiece_id;
  end if;

  if v_episode.active_revision_id is not null then
    select * into v_revision from tongs.recording_revisions where id=v_episode.active_revision_id
      and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id
      and canonical_recording_id=v_canonical.id and status='active';
  end if;
  if v_revision.id is null then
    select * into v_revision from tongs.recording_revisions where workspace_id=p_workspace_id
      and workpiece_id=p_workpiece_id and canonical_recording_id=v_canonical.id and status='active'
      order by created_at desc,id desc limit 1;
  end if;
  if v_revision.id is null then
    insert into tongs.recording_revisions(workspace_id,workpiece_id,canonical_recording_id,status,label,created_by,updated_by)
      values(p_workspace_id,p_workpiece_id,v_canonical.id,'active',p_revision_label,v_user,v_user) returning * into v_revision;
    update tongs.episodes set active_revision_id=v_revision.id,updated_at=now() where id=p_workpiece_id;
  end if;

  select * into v_existing from tongs.hammer_preparation_attempts
    where recording_revision_id=v_revision.id
      and state in ('reserved','resolving_recording','resolving_transcript','awaiting_transcript_choice','transcribing','hydrating')
    for update;
  if found then
    insert into tongs.hammer_open_operation_receipts(workspace_id,workpiece_id,operation_key,request_fingerprint,preparation_attempt_id,opened_by)
      values(p_workspace_id,p_workpiece_id,v_key,v_fingerprint,v_existing.id,v_user);
    return jsonb_build_object('outcome','attached','canonical_recording',to_jsonb(v_canonical),
      'revision',to_jsonb(v_revision),'preparation_attempt',to_jsonb(v_existing));
  end if;

  insert into tongs.hammer_preparation_attempts(workspace_id,workpiece_id,canonical_recording_id,
    recording_revision_id,source_kind,source_authority_id,source_capture_authority_id,media_path,media_id,
    media_hash,transcript_policy,state,operation_key,request_fingerprint,created_by)
  values(p_workspace_id,p_workpiece_id,v_canonical.id,v_revision.id,
    coalesce(v_canonical.source_kind,'legacy_unresolved'),v_canonical.source_authority_id,
    v_canonical.source_capture_authority_id,v_canonical.media_path,v_canonical.media_id,
    lower(v_canonical.media_signature),v_policy,
    case when v_canonical.source_kind is null then 'blocked' else 'resolving_transcript' end,
    v_key,v_fingerprint,v_user) returning * into v_attempt;
  insert into tongs.hammer_open_operation_receipts(workspace_id,workpiece_id,operation_key,request_fingerprint,preparation_attempt_id,opened_by)
    values(p_workspace_id,p_workpiece_id,v_key,v_fingerprint,v_attempt.id,v_user);
  return jsonb_build_object('outcome','opened','canonical_recording',to_jsonb(v_canonical),
    'revision',to_jsonb(v_revision),'preparation_attempt',to_jsonb(v_attempt));
exception when unique_violation then
  select r.request_fingerprint receipt_fingerprint,a.* into v_receipt from tongs.hammer_open_operation_receipts r
    join tongs.hammer_preparation_attempts a on a.id=r.preparation_attempt_id
    where r.workspace_id=p_workspace_id and r.operation_key=v_key;
  if found then
    if v_receipt.receipt_fingerprint<>v_fingerprint then return jsonb_build_object('outcome','conflict','reason','hammer_open_idempotency_conflict'); end if;
    select * into v_canonical from tongs.canonical_recordings where id=v_receipt.canonical_recording_id;
    select * into v_revision from tongs.recording_revisions where id=v_receipt.recording_revision_id;
    return jsonb_build_object('outcome','duplicate','canonical_recording',to_jsonb(v_canonical),'revision',to_jsonb(v_revision),
      'preparation_attempt',to_jsonb(v_receipt)-'receipt_fingerprint');
  end if;
  select * into v_existing from tongs.hammer_preparation_attempts where recording_revision_id=v_revision.id
    and state in ('reserved','resolving_recording','resolving_transcript','awaiting_transcript_choice','transcribing','hydrating');
  if found then
    insert into tongs.hammer_open_operation_receipts(workspace_id,workpiece_id,operation_key,request_fingerprint,preparation_attempt_id,opened_by)
      values(p_workspace_id,p_workpiece_id,v_key,v_fingerprint,v_existing.id,v_user);
    return jsonb_build_object('outcome','attached','canonical_recording',to_jsonb(v_canonical),
      'revision',to_jsonb(v_revision),'preparation_attempt',to_jsonb(v_existing));
  end if;
  raise;
end $$;

create or replace function tongs.advance_hammer_preparation(
  p_preparation_attempt_id uuid,p_expected_state_version bigint,p_action text,p_transcript_job_id uuid default null,
  p_transcript_artifact_path text default null,p_failure_code text default null,p_failure_detail text default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_user uuid:=auth.uid();v_attempt tongs.hammer_preparation_attempts%rowtype;v_next text;
begin
  select * into v_attempt from tongs.hammer_preparation_attempts where id=p_preparation_attempt_id for update;
  if not found then return jsonb_build_object('outcome','not_found','reason','preparation_attempt_not_found'); end if;
  if v_user is null or not tongs.has_workspace_role(v_attempt.workspace_id,'editor') then return jsonb_build_object('outcome','denied','reason','editor_required'); end if;
  if v_attempt.state_version<>p_expected_state_version then return jsonb_build_object('outcome','conflict','reason','preparation_state_changed','preparation_attempt',to_jsonb(v_attempt)); end if;
  v_next:=case p_action
    when 'await_transcript_choice' then 'awaiting_transcript_choice'
    when 'authorize_ai' then 'transcribing'
    when 'begin_hydration' then 'hydrating'
    when 'mark_ready' then 'ready'
    when 'retry' then 'resolving_transcript'
    when 'fail_recoverable' then 'recoverable_failure'
    when 'block' then 'blocked' else null end;
  if v_next is null then return jsonb_build_object('outcome','conflict','reason','preparation_action_invalid'); end if;
  if p_action='authorize_ai' and p_transcript_job_id is null then return jsonb_build_object('outcome','conflict','reason','transcript_job_required'); end if;
  update tongs.hammer_preparation_attempts set state=v_next,
    transcript_policy=case when p_action='authorize_ai' then 'allow_ai_fallback' else transcript_policy end,
    transcript_job_id=coalesce(p_transcript_job_id,transcript_job_id),
    transcript_artifact_path=coalesce(p_transcript_artifact_path,transcript_artifact_path),
    failure_code=case when p_action in ('fail_recoverable','block') then p_failure_code else null end,
    failure_detail=case when p_action in ('fail_recoverable','block') then p_failure_detail else null end,
    retry_count=retry_count+case when p_action='retry' then 1 else 0 end,
    completed_at=case when v_next='ready' then now() else completed_at end,
    failed_at=case when v_next in ('recoverable_failure','blocked') then now() else null end
  where id=p_preparation_attempt_id returning * into v_attempt;
  return jsonb_build_object('outcome','advanced','preparation_attempt',to_jsonb(v_attempt));
end $$;

revoke all on function tongs.open_hammer_authority(uuid,uuid,text,text,text) from public,anon;
grant execute on function tongs.open_hammer_authority(uuid,uuid,text,text,text) to authenticated,service_role;
revoke all on function tongs.advance_hammer_preparation(uuid,bigint,text,uuid,text,text,text) from public,anon;
grant execute on function tongs.advance_hammer_preparation(uuid,bigint,text,uuid,text,text,text) to authenticated,service_role;

commit;
