\set ON_ERROR_STOP on
do $$
declare v_projection_count bigint;
begin
  if not exists(select 1 from tongs.recording_capture_authorities where id='c3000000-0000-4000-8000-000000000001'
    and venue='anvil' and script_binding_kind='none') then raise exception 'legacy authority identity or binding was not preserved'; end if;
  if not exists(select 1 from tongs.anvil_capture_executions where execution_id='c3000000-0000-4000-8000-000000000002'
    and recording_capture_authority_id='c3000000-0000-4000-8000-000000000001') then raise exception 'legacy execution identity was not preserved'; end if;
  if not exists(select 1 from tongs.anvil_recording_completion_requests where id='b3000000-0000-4000-8000-000000000001'
    and capture_authority_id='c3000000-0000-4000-8000-000000000001') then raise exception 'legacy completion lineage was not preserved'; end if;
  if not exists(select 1 from tongs.anvil_recording_keep_requests where id='b3000000-0000-4000-8000-000000000002'
    and recording_capture_authority_id='c3000000-0000-4000-8000-000000000001') then raise exception 'legacy decision lineage was not preserved'; end if;
  if not exists(select 1 from tongs.hammer_recording_import_requests where id='b3000000-0000-4000-8000-000000000003' and state='committed')
    then raise exception 'Hammer lineage was not preserved'; end if;
  select count(*) into v_projection_count from tongs.current_workpiece_recorded_takes
    where workpiece_id='d3000000-0000-4000-8000-000000000001';
  if v_projection_count<>1 then raise exception 'recorded-take projection expected only the independently verified Hammer import, got %',v_projection_count; end if;
end $$;
select 'ok - legacy IDs and lineage survived; unverified legacy Anvil completion is excluded from Hammer projection';
