create schema if not exists public;

drop view if exists public.workspaces;

create view public.workspaces as
select
  id,
  name,
  created_by,
  created_at
from tongs.workspaces;
