begin;

create schema if not exists public;

drop view if exists public.workspaces;

create view public.workspaces
with (security_invoker = true)
as
select
  id,
  name,
  created_by,
  created_at
from tongs.workspaces;

alter view public.workspaces owner to postgres;

revoke all on table public.workspaces from public;
revoke all on table public.workspaces from anon;
grant all on table public.workspaces to authenticated;
grant all on table public.workspaces to service_role;

commit;
