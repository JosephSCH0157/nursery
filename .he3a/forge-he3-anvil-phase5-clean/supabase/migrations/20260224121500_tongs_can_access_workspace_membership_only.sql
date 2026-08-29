-- Align can_access_workspace with membership-only access (Option A).
create or replace function tongs.can_access_workspace(_workspace_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from tongs.workspace_members wm
    where wm.workspace_id = _workspace_id
      and wm.user_id = auth.uid()
  );
$$;
