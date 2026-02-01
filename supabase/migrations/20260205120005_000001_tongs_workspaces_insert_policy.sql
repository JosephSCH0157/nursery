drop policy if exists workspaces_insert_any on tongs.workspaces;

create policy workspaces_insert_self
on tongs.workspaces
for insert
with check (
  created_by = auth.uid()
);

-- Optional but recommended: read policy for creators
-- (kept here to ensure it exists even if prior migration was skipped)
drop policy if exists workspaces_read_if_creator on tongs.workspaces;

create policy workspaces_read_if_creator
on tongs.workspaces
for select
using (
  created_by = auth.uid()
);
