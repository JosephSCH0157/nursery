begin;

create or replace function tongs.guard_anvil_capture_authority_relationships()
returns trigger language plpgsql set search_path=pg_catalog,tongs as $$
declare v_ready tongs.workpiece_ready_transition_requests%rowtype;
begin
  if not exists(select 1 from tongs.episodes e where e.id=new.workpiece_id and e.workspace_id=new.workspace_id) then
    raise exception using errcode='23514',message='capture authority episode membership mismatch';
  end if;
  if new.recording_session_id is not null and not exists(
    select 1 from tongs.recording_sessions s where s.id=new.recording_session_id and s.workspace_id=new.workspace_id
  ) then raise exception using errcode='23514',message='capture authority planner session mismatch'; end if;
  if new.ready_transition_id is not null then
    select * into v_ready from tongs.workpiece_ready_transition_requests where id=new.ready_transition_id;
    if not found or v_ready.workspace_id<>new.workspace_id or v_ready.workpiece_id<>new.workpiece_id
      or v_ready.script_path<>new.script_path or v_ready.script_revision<>new.script_revision
      or lower(v_ready.script_hash)<>new.script_hash then
      raise exception using errcode='23514',message='capture authority Ready transition mismatch';
    end if;
  elsif new.provenance='live_established' then
    raise exception using errcode='23514',message='live capture authority requires Ready transition';
  end if;
  return new;
end $$;

create trigger trg_anvil_capture_authority_relationships
before insert on tongs.anvil_capture_authorities
for each row execute function tongs.guard_anvil_capture_authority_relationships();

commit;
