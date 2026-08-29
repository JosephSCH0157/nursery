alter table tongs.workspaces
  add column if not exists name text not null default 'Workspace';
