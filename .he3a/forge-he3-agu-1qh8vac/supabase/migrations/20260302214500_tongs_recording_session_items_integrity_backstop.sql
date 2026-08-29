-- Backstop: enforce recording session item uniqueness for (session, episode, script path)
-- in environments that may have drifted before the canonical migration applied.

begin;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'recording_session_items_session_episode_path_unique'
      and conrelid = 'tongs.recording_session_items'::regclass
  ) then
    alter table tongs.recording_session_items
      add constraint recording_session_items_session_episode_path_unique
      unique (session_id, episode_id, script_path);
  end if;
end
$$;

commit;
