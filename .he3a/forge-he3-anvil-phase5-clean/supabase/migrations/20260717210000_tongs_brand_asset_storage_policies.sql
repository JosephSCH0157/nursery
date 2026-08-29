begin;

-- Branding object access is authorized by the canonical reserved asset revision,
-- not by parsing or trusting the object path supplied by a client.
drop policy if exists brand_asset_objects_select on storage.objects;
create policy brand_asset_objects_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'forge-workpieces'
  and exists (
    select 1
    from tongs.brand_asset_revisions revision
    where revision.storage_bucket = storage.objects.bucket_id
      and revision.storage_key = storage.objects.name
      and tongs.has_workspace_role(revision.workspace_id, 'viewer')
  )
);

drop policy if exists brand_asset_objects_insert on storage.objects;
create policy brand_asset_objects_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'forge-workpieces'
  and exists (
    select 1
    from tongs.brand_asset_revisions revision
    where revision.storage_bucket = storage.objects.bucket_id
      and revision.storage_key = storage.objects.name
      and revision.state = 'pending'
      and revision.created_by = auth.uid()
      and tongs.has_workspace_role(revision.workspace_id, 'editor')
  )
);

commit;
