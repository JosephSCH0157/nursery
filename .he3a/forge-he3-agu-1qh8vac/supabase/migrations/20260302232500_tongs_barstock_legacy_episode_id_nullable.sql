-- Decouple legacy spark.episode_id from required persistence.
-- Project ownership is now assignment_id + explicit project/workpiece links.

begin;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'tongs'
      and table_name = 'barstock_sparks'
      and column_name = 'episode_id'
  ) then
    alter table tongs.barstock_sparks
      alter column episode_id drop not null;
  end if;
end;
$$;

commit;
