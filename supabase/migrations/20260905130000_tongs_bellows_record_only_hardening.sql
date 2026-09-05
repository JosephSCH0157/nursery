-- Bellows record-only authority hardening.
-- Bind capture mutations to the authenticated participant and make terminal
-- certification evidence append-only.

begin;

create or replace function tongs.bellows_assert_capture_participant(
  p_session_id text,
  p_participant_id text
) returns void
language plpgsql
security definer
set search_path = tongs, public, auth
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return;
  end if;

  if not exists (
    select 1
    from tongs.bellows_session_participants participant
    where participant.session_id = p_session_id
      and participant.id = p_participant_id
      and participant.user_id = auth.uid()
  ) then
    raise exception 'bellows_capture_participant_forbidden';
  end if;
end;
$$;

create or replace function tongs.register_bellows_upload_part(
  p_session_id text, p_participant_id text, p_segment_id text, p_part_id text,
  p_sequence_number integer, p_byte_length bigint, p_sha256 text, p_storage_key text
) returns tongs.bellows_upload_parts
language plpgsql security definer set search_path = tongs, public, auth as $$
declare v_segment tongs.bellows_segments; v_existing tongs.bellows_upload_parts; v_result tongs.bellows_upload_parts;
begin
  select * into v_segment from tongs.bellows_segments where id=p_segment_id and session_id=p_session_id;
  if not found then raise exception 'bellows_segment_not_found'; end if;
  if v_segment.participant_id<>p_participant_id then raise exception 'bellows_segment_participant_conflict'; end if;
  perform tongs.bellows_assert_capture_participant(p_session_id,p_participant_id);
  select * into v_existing from tongs.bellows_upload_parts where id=p_part_id;
  if found then
    if v_existing.segment_id<>p_segment_id or v_existing.participant_id<>p_participant_id
      or v_existing.sequence_number<>p_sequence_number or v_existing.byte_length<>p_byte_length
      or v_existing.sha256<>lower(p_sha256) or v_existing.storage_key<>p_storage_key then
      raise exception 'bellows_upload_part_identity_conflict';
    end if;
    return v_existing;
  end if;
  insert into tongs.bellows_upload_parts(id,segment_id,session_id,participant_id,workspace_id,sequence_number,byte_length,sha256,storage_key)
    values(p_part_id,p_segment_id,p_session_id,p_participant_id,v_segment.workspace_id,p_sequence_number,p_byte_length,lower(p_sha256),p_storage_key)
    returning * into v_result;
  return v_result;
end $$;

create or replace function tongs.confirm_bellows_upload_part(
  p_part_id text, p_sha256 text
) returns tongs.bellows_upload_parts
language plpgsql security definer set search_path = tongs, public, auth as $$
declare v_part tongs.bellows_upload_parts;
begin
  select * into v_part from tongs.bellows_upload_parts where id=p_part_id for update;
  if not found then raise exception 'bellows_upload_part_not_found'; end if;
  perform tongs.bellows_assert_capture_participant(v_part.session_id,v_part.participant_id);
  if v_part.sha256<>lower(p_sha256) then raise exception 'bellows_upload_part_checksum_conflict'; end if;
  update tongs.bellows_upload_parts
    set upload_state='verified_received', verified_at=coalesce(verified_at,now()),
        attempt_count=attempt_count+1, last_error=null
    where id=p_part_id returning * into v_part;
  return v_part;
end $$;

create or replace function tongs.verify_bellows_capture_segment(
  p_segment_id text, p_expected_part_count integer, p_byte_length bigint,
  p_sha256 text, p_storage_key text, p_ended_at timestamptz, p_duration_ms bigint
) returns tongs.bellows_segments
language plpgsql security definer set search_path = tongs, public, auth, storage as $$
declare v_segment tongs.bellows_segments; v_count integer; v_bytes bigint; v_object_bytes bigint;
begin
  select * into v_segment from tongs.bellows_segments where id=p_segment_id for update;
  if not found then raise exception 'bellows_segment_not_found'; end if;
  perform tongs.bellows_assert_capture_participant(v_segment.session_id,v_segment.participant_id);
  select count(*),coalesce(sum(byte_length),0) into v_count,v_bytes
    from tongs.bellows_upload_parts where segment_id=p_segment_id and upload_state='verified_received';
  if v_count<>p_expected_part_count or v_bytes<>p_byte_length then raise exception 'bellows_segment_parts_incomplete'; end if;
  select (metadata ->> 'size')::bigint into v_object_bytes
    from storage.objects where bucket_id='bellows-capture' and name=p_storage_key;
  if v_object_bytes is null then raise exception 'bellows_canonical_segment_missing'; end if;
  if v_object_bytes<>p_byte_length then raise exception 'bellows_canonical_segment_size_conflict'; end if;
  update tongs.bellows_segments
    set expected_part_count=p_expected_part_count,byte_length=p_byte_length,sha256=lower(p_sha256),
        storage_bucket='bellows-capture',storage_key=p_storage_key,ended_at=p_ended_at,
        duration_ms=p_duration_ms,integrity_state='verified',verified_at=now()
    where id=p_segment_id returning * into v_segment;
  return v_segment;
end $$;

create or replace function tongs.reject_bellows_terminal_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'bellows_terminal_evidence_is_immutable' using errcode='55000';
end;
$$;

drop trigger if exists trg_bellows_incomplete_acceptances_immutable on tongs.bellows_incomplete_acceptances;
create trigger trg_bellows_incomplete_acceptances_immutable
before update or delete on tongs.bellows_incomplete_acceptances
for each row execute function tongs.reject_bellows_terminal_mutation();

drop trigger if exists trg_bellows_capture_packages_immutable on tongs.bellows_capture_packages;
create trigger trg_bellows_capture_packages_immutable
before update or delete on tongs.bellows_capture_packages
for each row execute function tongs.reject_bellows_terminal_mutation();

drop policy if exists bellows_capture_operator_insert on storage.objects;
create policy bellows_capture_operator_insert on storage.objects for insert to authenticated with check (
  bucket_id='bellows-capture'
  and exists (
    select 1
    from tongs.bellows_session_participants participant
    where participant.session_id=(storage.foldername(name))[2]
      and participant.id=(storage.foldername(name))[3]
      and participant.user_id=auth.uid()
  )
);

revoke all on function tongs.bellows_assert_capture_participant(text,text) from public;
grant execute on function tongs.bellows_assert_capture_participant(text,text) to authenticated,service_role;

commit;
