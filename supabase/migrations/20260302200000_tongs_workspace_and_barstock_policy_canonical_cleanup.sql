-- Canonicalize workspace/barstock RLS by removing legacy permissive policies.
-- This migration intentionally drops ALL existing policies on targeted tables
-- and recreates the role-gated canonical set.

begin;

do $$
declare
  v_table text;
  v_policy text;
begin
  foreach v_table in array array[
    'workspace_members',
    'workspace_invites',
    'episodes',
    'barstock_assignments',
    'barstock_sparks',
    'barstock_project_episode_links'
  ]
  loop
    for v_policy in
      select p.policyname
      from pg_policies p
      where p.schemaname = 'tongs'
        and p.tablename = v_table
    loop
      execute format('drop policy if exists %I on tongs.%I', v_policy, v_table);
    end loop;
  end loop;
end
$$;

alter table tongs.workspace_members enable row level security;
alter table tongs.workspace_invites enable row level security;
alter table tongs.episodes enable row level security;
alter table tongs.barstock_assignments enable row level security;
alter table tongs.barstock_sparks enable row level security;
alter table tongs.barstock_project_episode_links enable row level security;

create policy workspace_members_read_if_workspace_member
on tongs.workspace_members
for select
to authenticated
using (
  tongs.has_workspace_role(tongs.workspace_members.workspace_id, 'viewer')
);

create policy workspace_members_insert_if_admin
on tongs.workspace_members
for insert
to authenticated
with check (
  tongs.has_workspace_role(tongs.workspace_members.workspace_id, 'admin')
  and tongs.workspace_role_rank(tongs.workspace_members.role) > 0
  and (
    tongs.workspace_members.role <> 'owner'
    or tongs.has_workspace_role(tongs.workspace_members.workspace_id, 'owner')
  )
);

create policy workspace_members_update_if_admin
on tongs.workspace_members
for update
to authenticated
using (
  tongs.has_workspace_role(tongs.workspace_members.workspace_id, 'admin')
)
with check (
  tongs.has_workspace_role(tongs.workspace_members.workspace_id, 'admin')
  and tongs.workspace_role_rank(tongs.workspace_members.role) > 0
  and (
    tongs.workspace_members.role <> 'owner'
    or tongs.has_workspace_role(tongs.workspace_members.workspace_id, 'owner')
  )
);

create policy workspace_members_delete_if_admin_or_self
on tongs.workspace_members
for delete
to authenticated
using (
  tongs.has_workspace_role(tongs.workspace_members.workspace_id, 'admin')
  or tongs.workspace_members.user_id = auth.uid()
);

create policy workspace_invites_select_if_workspace_member
on tongs.workspace_invites
for select
to authenticated
using (
  tongs.has_workspace_role(tongs.workspace_invites.workspace_id, 'viewer')
);

create policy workspace_invites_insert_if_admin
on tongs.workspace_invites
for insert
to authenticated
with check (
  tongs.has_workspace_role(tongs.workspace_invites.workspace_id, 'admin')
  and (
    tongs.workspace_invites.role <> 'owner'
    or tongs.has_workspace_role(tongs.workspace_invites.workspace_id, 'owner')
  )
);

create policy workspace_invites_update_if_admin
on tongs.workspace_invites
for update
to authenticated
using (
  tongs.has_workspace_role(tongs.workspace_invites.workspace_id, 'admin')
)
with check (
  tongs.has_workspace_role(tongs.workspace_invites.workspace_id, 'admin')
  and (
    tongs.workspace_invites.role <> 'owner'
    or tongs.has_workspace_role(tongs.workspace_invites.workspace_id, 'owner')
  )
);

create policy workspace_invites_delete_if_admin
on tongs.workspace_invites
for delete
to authenticated
using (
  tongs.has_workspace_role(tongs.workspace_invites.workspace_id, 'admin')
);

create policy episodes_select_if_workspace_viewer
on tongs.episodes
for select
to authenticated
using (
  tongs.has_workspace_role(tongs.episodes.workspace_id, 'viewer')
);

create policy episodes_insert_if_workspace_editor
on tongs.episodes
for insert
to authenticated
with check (
  tongs.has_workspace_role(tongs.episodes.workspace_id, 'editor')
);

create policy episodes_update_if_workspace_editor
on tongs.episodes
for update
to authenticated
using (
  tongs.has_workspace_role(tongs.episodes.workspace_id, 'editor')
)
with check (
  tongs.has_workspace_role(tongs.episodes.workspace_id, 'editor')
);

create policy episodes_delete_if_workspace_admin
on tongs.episodes
for delete
to authenticated
using (
  tongs.has_workspace_role(tongs.episodes.workspace_id, 'admin')
);

create policy barstock_assignments_select_if_workspace_viewer
on tongs.barstock_assignments
for select
to authenticated
using (
  tongs.has_workspace_role(tongs.barstock_assignments.workspace_id, 'viewer')
);

create policy barstock_assignments_insert_if_workspace_editor
on tongs.barstock_assignments
for insert
to authenticated
with check (
  tongs.has_workspace_role(tongs.barstock_assignments.workspace_id, 'editor')
);

create policy barstock_assignments_update_if_workspace_editor
on tongs.barstock_assignments
for update
to authenticated
using (
  tongs.has_workspace_role(tongs.barstock_assignments.workspace_id, 'editor')
)
with check (
  tongs.has_workspace_role(tongs.barstock_assignments.workspace_id, 'editor')
);

create policy barstock_assignments_delete_if_workspace_admin
on tongs.barstock_assignments
for delete
to authenticated
using (
  tongs.has_workspace_role(tongs.barstock_assignments.workspace_id, 'admin')
);

create policy barstock_sparks_select_if_workspace_viewer
on tongs.barstock_sparks
for select
to authenticated
using (
  tongs.has_workspace_role(tongs.barstock_sparks.workspace_id, 'viewer')
);

create policy barstock_sparks_insert_if_workspace_editor
on tongs.barstock_sparks
for insert
to authenticated
with check (
  tongs.has_workspace_role(tongs.barstock_sparks.workspace_id, 'editor')
);

create policy barstock_sparks_update_if_workspace_editor
on tongs.barstock_sparks
for update
to authenticated
using (
  tongs.has_workspace_role(tongs.barstock_sparks.workspace_id, 'editor')
)
with check (
  tongs.has_workspace_role(tongs.barstock_sparks.workspace_id, 'editor')
);

create policy barstock_sparks_delete_if_workspace_admin
on tongs.barstock_sparks
for delete
to authenticated
using (
  tongs.has_workspace_role(tongs.barstock_sparks.workspace_id, 'admin')
);

create policy barstock_project_episode_links_select_if_workspace_viewer
on tongs.barstock_project_episode_links
for select
to authenticated
using (
  tongs.has_workspace_role(tongs.barstock_project_episode_links.workspace_id, 'viewer')
);

create policy barstock_project_episode_links_insert_if_workspace_editor
on tongs.barstock_project_episode_links
for insert
to authenticated
with check (
  tongs.has_workspace_role(tongs.barstock_project_episode_links.workspace_id, 'editor')
);

create policy barstock_project_episode_links_update_if_workspace_editor
on tongs.barstock_project_episode_links
for update
to authenticated
using (
  tongs.has_workspace_role(tongs.barstock_project_episode_links.workspace_id, 'editor')
)
with check (
  tongs.has_workspace_role(tongs.barstock_project_episode_links.workspace_id, 'editor')
);

create policy barstock_project_episode_links_delete_if_workspace_admin
on tongs.barstock_project_episode_links
for delete
to authenticated
using (
  tongs.has_workspace_role(tongs.barstock_project_episode_links.workspace_id, 'admin')
);

commit;
