-- Allow any authenticated user to create a workspace
drop policy if exists workspaces_insert_any on tongs.workspaces;

create policy workspaces_insert_any
on tongs.workspaces
for insert
with check (
  auth.uid() is not null
);

-- Automatically allow creator to see their own workspace
drop policy if exists workspaces_read_if_creator on tongs.workspaces;

create policy workspaces_read_if_creator
on tongs.workspaces
for select
using (
  created_by = auth.uid()
);
