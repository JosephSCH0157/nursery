-- Enforce deterministic one-project-to-one-workpiece links, even if the table
-- existed before the uniqueness constraint was introduced.

do $$
begin
  if to_regclass('tongs.barstock_project_episode_links') is null then
    return;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'tongs.barstock_project_episode_links'::regclass
      and conname = 'barstock_project_episode_links_project_unique'
  ) then
    with ranked as (
      select
        ctid,
        row_number() over (
          partition by workspace_id, project_id
          order by created_at asc, workpiece_id asc
        ) as rn
      from tongs.barstock_project_episode_links
    )
    delete from tongs.barstock_project_episode_links target
    using ranked
    where target.ctid = ranked.ctid
      and ranked.rn > 1;

    alter table tongs.barstock_project_episode_links
      add constraint barstock_project_episode_links_project_unique
      unique (workspace_id, project_id);
  end if;
end;
$$;

create index if not exists barstock_project_episode_links_workpiece_idx
  on tongs.barstock_project_episode_links (workpiece_id);
