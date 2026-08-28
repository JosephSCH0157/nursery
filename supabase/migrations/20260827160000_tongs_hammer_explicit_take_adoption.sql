begin;

-- A workpiece has one current canonical recording pointer, but prior canonical
-- recordings remain immutable evidence after an explicit source supersession.
alter table tongs.canonical_recordings
  drop constraint if exists canonical_recordings_one_per_workpiece;

create index if not exists canonical_recordings_workpiece_created_idx
  on tongs.canonical_recordings(workspace_id, workpiece_id, created_at desc);

create table if not exists tongs.hammer_take_adoption_receipts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
  workpiece_id uuid not null references tongs.episodes(id) on delete restrict,
  operation_key text not null check (length(btrim(operation_key)) between 8 and 200),
  request_fingerprint text not null check (length(request_fingerprint) = 32),
  prior_canonical_recording_id uuid null references tongs.canonical_recordings(id) on delete restrict,
  adopted_canonical_recording_id uuid not null references tongs.canonical_recordings(id) on delete restrict,
  source_kind text not null check (source_kind in ('anvil_capture','hammer_import')),
  source_authority_id uuid not null,
  adopted_by uuid not null references auth.users(id),
  adopted_at timestamptz not null default now(),
  constraint hammer_take_adoption_workspace_operation_key unique(workspace_id, operation_key)
);

alter table tongs.hammer_take_adoption_receipts enable row level security;
drop policy if exists hammer_take_adoption_select_if_workspace_viewer on tongs.hammer_take_adoption_receipts;
create policy hammer_take_adoption_select_if_workspace_viewer
on tongs.hammer_take_adoption_receipts for select to authenticated
using (tongs.has_workspace_role(workspace_id, 'viewer'));
revoke insert, update, delete on tongs.hammer_take_adoption_receipts from authenticated;
grant select on tongs.hammer_take_adoption_receipts to authenticated;
grant all on tongs.hammer_take_adoption_receipts to service_role;

create or replace function tongs.adopt_latest_kept_take_for_hammer(
  p_workspace_id uuid,
  p_workpiece_id uuid,
  p_operation_key text
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,tongs
as $$
declare
  v_user uuid := auth.uid();
  v_key text := btrim(coalesce(p_operation_key, ''));
  v_fingerprint text;
  v_episode tongs.episodes%rowtype;
  v_prior tongs.canonical_recordings%rowtype;
  v_adopted tongs.canonical_recordings%rowtype;
  v_take record;
  v_receipt tongs.hammer_take_adoption_receipts%rowtype;
  v_capture uuid;
  v_media_id text;
begin
  if v_user is null or not tongs.has_workspace_role(p_workspace_id, 'editor') then
    return jsonb_build_object('outcome','denied','reason','editor_required');
  end if;
  if length(v_key) not between 8 and 200 then
    return jsonb_build_object('outcome','conflict','reason','invalid_adoption_request');
  end if;

  select * into v_episode from tongs.episodes
    where id=p_workpiece_id and workspace_id=p_workspace_id for update;
  if not found then
    return jsonb_build_object('outcome','not_found','reason','workpiece_membership_mismatch');
  end if;

  v_fingerprint := md5(concat_ws('|', p_workspace_id, p_workpiece_id, 'latest_kept_take'));
  select * into v_receipt from tongs.hammer_take_adoption_receipts
    where workspace_id=p_workspace_id and operation_key=v_key;
  if found then
    if v_receipt.request_fingerprint <> v_fingerprint then
      return jsonb_build_object('outcome','conflict','reason','hammer_take_adoption_idempotency_conflict');
    end if;
    select * into v_adopted from tongs.canonical_recordings where id=v_receipt.adopted_canonical_recording_id;
    return jsonb_build_object('outcome','duplicate','canonical_recording',to_jsonb(v_adopted),'receipt',to_jsonb(v_receipt));
  end if;

  if v_episode.canonical_recording_id is not null then
    select * into v_prior from tongs.canonical_recordings
      where id=v_episode.canonical_recording_id and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
    if not found then
      return jsonb_build_object('outcome','blocked','reason','canonical_recording_pointer_invalid');
    end if;
  end if;

  select r.*, c.capture_authority_id into v_take
    from tongs.current_workpiece_recorded_takes r
    left join tongs.anvil_recording_completion_requests c on c.id=r.completion_id
    where r.workspace_id=p_workspace_id and r.workpiece_id=p_workpiece_id and r.keep_id is not null
    order by r.kept_at desc nulls last, r.completed_at desc, r.source_authority_id desc limit 1;
  if not found then
    return jsonb_build_object('outcome','blocked','reason','canonical_recording_missing_take');
  end if;

  v_capture := v_take.capture_authority_id;
  v_media_id := case when v_take.source_kind='anvil_capture'
    then 'anvil-completion:'||v_take.source_authority_id::text
    else 'hammer-import:'||v_take.source_authority_id::text end;

  if v_prior.id is not null
    and v_prior.source_kind=v_take.source_kind
    and v_prior.source_authority_id=v_take.source_authority_id then
    insert into tongs.hammer_take_adoption_receipts(
      workspace_id,workpiece_id,operation_key,request_fingerprint,prior_canonical_recording_id,
      adopted_canonical_recording_id,source_kind,source_authority_id,adopted_by
    ) values (
      p_workspace_id,p_workpiece_id,v_key,v_fingerprint,v_prior.id,v_prior.id,
      v_take.source_kind,v_take.source_authority_id,v_user
    ) returning * into v_receipt;
    return jsonb_build_object('outcome','already_current','canonical_recording',to_jsonb(v_prior),'receipt',to_jsonb(v_receipt));
  end if;

  update tongs.recording_revisions set status='superseded',updated_by=v_user,updated_at=now()
    where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and status='active';
  update tongs.hammer_preparation_attempts set state='superseded'
    where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id
      and state not in ('ready','blocked','superseded');

  insert into tongs.canonical_recordings(
    workspace_id,workpiece_id,status,kept_take_event_id,media_path,media_content_type,media_bytes,
    recording_session_id,anvil_capture_session_id,media_id,media_signature,source_kind,
    source_authority_id,source_capture_authority_id,created_by,updated_by
  ) values (
    p_workspace_id,p_workpiece_id,'draft',null,v_take.media_path,v_take.media_content_type,v_take.media_bytes,
    v_take.recording_session_id,v_take.capture_session_id::text,v_media_id,lower(v_take.media_hash),v_take.source_kind,
    v_take.source_authority_id,v_capture,v_user,v_user
  ) returning * into v_adopted;

  update tongs.episodes set canonical_recording_id=v_adopted.id,active_revision_id=null,updated_at=now()
    where id=p_workpiece_id and workspace_id=p_workspace_id;

  insert into tongs.hammer_take_adoption_receipts(
    workspace_id,workpiece_id,operation_key,request_fingerprint,prior_canonical_recording_id,
    adopted_canonical_recording_id,source_kind,source_authority_id,adopted_by
  ) values (
    p_workspace_id,p_workpiece_id,v_key,v_fingerprint,v_prior.id,v_adopted.id,
    v_take.source_kind,v_take.source_authority_id,v_user
  ) returning * into v_receipt;

  return jsonb_build_object('outcome','adopted','canonical_recording',to_jsonb(v_adopted),'receipt',to_jsonb(v_receipt));
exception when unique_violation then
  select * into v_receipt from tongs.hammer_take_adoption_receipts
    where workspace_id=p_workspace_id and operation_key=v_key;
  if found and v_receipt.request_fingerprint=v_fingerprint then
    select * into v_adopted from tongs.canonical_recordings where id=v_receipt.adopted_canonical_recording_id;
    return jsonb_build_object('outcome','duplicate','canonical_recording',to_jsonb(v_adopted),'receipt',to_jsonb(v_receipt));
  end if;
  raise;
end $$;

revoke all on function tongs.adopt_latest_kept_take_for_hammer(uuid,uuid,text) from public,anon;
grant execute on function tongs.adopt_latest_kept_take_for_hammer(uuid,uuid,text) to authenticated,service_role;

commit;
