# Hammer editorial-authority persistence contract (design only)

Status: mutation-free design. Do not apply this migration or write Florida Oranges authority/history without a separately reviewed dry run.

## Ownership

Editorial authority is owned by a `tongs.recording_revisions` row. The artifact must identify the exact workspace, workpiece, canonical recording, and revision. A workpiece response may project the active revision's pointer, but `hammer_workpiece_state` must not own or accept it.

Changing `episodes.canonical_recording_id` or `episodes.active_revision_id` changes the projected authority atomically with the existing episode pointer update. A new revision starts with a null authority pointer. No historical row is backfilled automatically.

## Required database and RLS migration

This requires a DB migration / RLS update. The proposed migration is:

```sql
begin;

alter table tongs.recording_revisions
  add column if not exists editorial_authority_path text null,
  add column if not exists editorial_authority_fingerprint text null,
  add column if not exists editorial_authority_revision bigint not null default 0;

alter table tongs.recording_revisions
  drop constraint if exists recording_revisions_editorial_authority_revision_nonnegative;
alter table tongs.recording_revisions
  add constraint recording_revisions_editorial_authority_revision_nonnegative
  check (editorial_authority_revision >= 0);

comment on column tongs.recording_revisions.editorial_authority_path is
  'Revision-owned canonical Hammer editorial-authority artifact path; null means no authority established.';
comment on column tongs.recording_revisions.editorial_authority_fingerprint is
  'SHA-256 of the exact canonical serialized artifact bytes acknowledged by Tongs.';
comment on column tongs.recording_revisions.editorial_authority_revision is
  'Monotonic optimistic-concurrency counter for editorial-authority pointer acknowledgement.';

-- Preserve the existing recording_revisions viewer-read/editor-write boundary explicitly.
alter table tongs.recording_revisions enable row level security;
drop policy if exists recording_revisions_select_if_workspace_viewer on tongs.recording_revisions;
create policy recording_revisions_select_if_workspace_viewer
on tongs.recording_revisions for select to authenticated
using (tongs.has_workspace_role(workspace_id, 'viewer'));

drop policy if exists recording_revisions_update_if_workspace_editor on tongs.recording_revisions;
create policy recording_revisions_update_if_workspace_editor
on tongs.recording_revisions for update to authenticated
using (tongs.has_workspace_role(workspace_id, 'editor'))
with check (
  tongs.has_workspace_role(workspace_id, 'editor')
  and updated_by = auth.uid()
);

grant select on table tongs.recording_revisions to authenticated;
grant update on table tongs.recording_revisions to authenticated;
grant all on table tongs.recording_revisions to service_role;

commit;
```

The generated database types must then be refreshed; handwritten casts are not an acceptable substitute.

## Narrow Tongs API

Add a revision-scoped endpoint, not a workpiece save field:

```ts
type CommitEditorialAuthorityRequest = {
  workspace_id: string;
  workpiece_id: string;
  canonical_recording_id: string;
  revision_id: string;
  path: string;
  exact_bytes_base64: string;
  content_sha256: string;
  expected_revision_updated_at: string;
  expected_authority_revision: number;
  expected_authority_path: string | null;
};
```

The endpoint validates that all four identities belong to one active revision, validates the artifact's embedded identities and schema, verifies the supplied SHA-256 over the exact canonical bytes, and returns a typed acknowledgement containing the pointer, fingerprint, authority revision, revision `updated_at`, and artifact file metadata. Conflicts are classified; there is no force path.

Supabase Storage upload and Postgres pointer acknowledgement cannot be one database transaction in the current architecture. Therefore implementation must use a tested two-phase coordinator:

1. Read and freeze original pointer metadata and intended bytes.
2. Write the deterministic artifact using artifact-level optimistic metadata.
3. Acknowledge its pointer with a narrow RPC comparing revision identity, `updated_at`, current pointer, and authority revision.
4. On ambiguous response, reread both artifact and pointer before retrying.
5. Resume only an untouched suffix; compensate an acknowledged prefix only with CAS; abort on foreign hashes or metadata.

Repeated identical requests must return the existing acknowledgement without another artifact write or authority-revision increment.

## Florida Oranges dry-run gate

The dry run may construct the identity-only authority graph and proposed history entry offline, but must not write them. It must prove unique derivation from the exact 137-segment transcript, recording/media identity, baseline and revision; byte-identical repeated serialization; exact original/intended hashes; isolated forward/inverse history replay; and coordinator write/resume/compensation counts. History mutation remains blocked until mounted history installation is accepted.

