begin;

alter table tongs.barstock_project_episode_links
  drop constraint if exists barstock_project_episode_links_pkey;

alter table tongs.barstock_project_episode_links
  add constraint barstock_project_episode_links_pkey primary key (id);

create unique index if not exists barstock_project_episode_links_membership_idx
  on tongs.barstock_project_episode_links(workspace_id,project_id,workpiece_id);

commit;
