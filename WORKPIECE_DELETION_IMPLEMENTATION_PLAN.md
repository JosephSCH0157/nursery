# Workpiece Deletion Implementation Plan

Implementation plan only. Constitutional lifecycle semantics are defined in `FORGE_SPARK_TO_ANVIL_LIFECYCLE_CANON.md`. Policy intent is defined in `WORKPIECE_DELETION_POLICY_PLAN.md`.

Slice 1 status: completed on 2026-03-11.

Completion note:

- `WORKPIECE_DELETION_SLICE_1_COMPLETION.md`

Next lock:

- `WORKPIECE_DELETION_SLICE_2_RESTORE_REINTEGRATION_LOCK.md`

This requires a DB migration / RLS update.

## Purpose

Turn the archive-first deletion policy into a concrete implementation sequence that fits the current Hearth/Tongs architecture without inventing draft-local or UI-only deletion semantics.

## Current Code Reality

Current workpiece persistence and listing:

- `supabase/migrations/20260224123000_tongs_episodes_cradle_alignment.sql`
- `packages/tongs/src/workpiece-commit-api.ts`
- `apps/hearth/src/lib/hearth-workpieces.ts`

Current Hearth cleanup actions are still draft-local:

- `apps/hearth/src/storage/hearth-store.ts`
- `apps/hearth/src/storage/tongs-store.ts`
- `apps/hearth/src/routes/HearthShell.tsx`

Current shipped posture:

- Hearth still has `deleteDraft()` for draft-buffer cleanup, but it is explicitly no longer the workpiece deletion path.
- Hearth now has canonical workpiece archive and restore.
- `tongs.episodes` now represents archived workpieces canonically.
- Archived workpieces are excluded from default episode, Ready, and session-candidate flows unless intentionally included or restored first.

## First Slice Goal

Implement canonical workpiece archive and restore only.

Archive changes visibility, not lineage. Archived workpieces are non-destructive hidden records; restoring reverses visibility state without reconstructing lineage.

First slice does not implement:

- general hard delete
- purge
- destructive dependency cleanup of recorded workpieces

## Migration Shape

Create a new migration after the current workpiece/ready/image-map migrations.

Recommended schema change:

```sql
begin;

alter table tongs.episodes
  add column if not exists archived_at timestamptz null,
  add column if not exists archived_by uuid null references auth.users(id),
  add column if not exists archive_reason text null;

alter table tongs.episodes
  drop constraint if exists episodes_archive_fields_check;

alter table tongs.episodes
  add constraint episodes_archive_fields_check check (
    (archived_at is null and archived_by is null)
    or (archived_at is not null and archived_by is not null)
  );

create index if not exists episodes_workspace_active_updated_idx
  on tongs.episodes (workspace_id, updated_at desc)
  where archived_at is null;

create index if not exists episodes_workspace_archived_updated_idx
  on tongs.episodes (workspace_id, archived_at desc, updated_at desc)
  where archived_at is not null;

commit;
```

Rationale:

- `archived_at` is the canonical archive state.
- `archived_by` keeps the current archive actor on the row.
- `archive_reason` stays optional and gives the UI somewhere to record intentional cleanup reasons later.
- Archive is reversible, so hard-delete fields are not needed in slice 1.

## RLS / Access Posture

This requires a DB migration / RLS update.

For slice 1, the existing `episodes_update_if_workspace_editor` and `episodes_delete_if_workspace_admin` posture is directionally correct, but the migration should explicitly preserve or refresh the editor/admin split after the schema change.

Slice 1 rule:

- editors may archive and restore
- admins retain destructive delete authority for future hard-delete paths

If you want stricter actor integrity on `archived_by`, keep archive/restore writes behind the Tongs API only and set `archived_by` server-side from the authenticated actor.

## Tongs API Changes

Primary file:

- `packages/tongs/src/workpiece-commit-api.ts`

Type changes:

- Extend `WorkspaceEpisodeSummary` with:
  - `archived_at: string | null`
  - `archived_by: string | null`
  - `archive_reason: string | null`
- Extend `ListWorkspaceEpisodesOptions` with:
  - `includeArchived?: boolean`

Read behavior:

- `listWorkspaceEpisodes(workspaceId, options)` should default to `archived_at is null`
- `includeArchived: true` should include both active and archived rows
- sort should remain `updated_at desc` within the chosen set

Write methods to add:

- `archiveWorkpiece(workpieceId, input, options?)`
- `restoreWorkpiece(workpieceId, input, options?)`

Recommended request shapes:

```ts
type ArchiveWorkpieceRequest = {
  workspace_id: string;
  reason?: string | null;
};

type RestoreWorkpieceRequest = {
  workspace_id: string;
};
```

Recommended routes:

- `POST /tongs/workpieces/:id/archive`
- `POST /tongs/workpieces/:id/restore`

Archive route behavior:

1. resolve workpiece
2. assert same workspace
3. assert editor role from access token
4. update `episodes.archived_at`, `episodes.archived_by`, `episodes.archive_reason`
5. append canonical event such as `hearth.workpiece.archived.v1`
6. return updated episode summary

Restore route behavior:

1. resolve workpiece
2. assert same workspace
3. assert editor role from access token
4. clear `archived_at`, `archived_by`, `archive_reason`
5. append canonical event such as `hearth.workpiece.restored.v1`
6. return updated episode summary

Do not add hard-delete or purge routes in slice 1.

## Query Contract Changes

Current list route:

- `GET /tongs/workspaces/:id/episodes`

Slice 1 extension:

- support `include_archived=1`

Expected behavior:

- default route powers normal Episodes list and excludes archived workpieces
- `include_archived=1` powers `Show archived`
- archived workpieces remain hidden from default ready/open flows unless explicitly restored

## Event Logging

Reuse the existing workpiece-events spine.

Primary seam:

- `packages/tongs/src/workpiece-commit-api.ts`

Events to add:

- `hearth.workpiece.archived.v1`
- `hearth.workpiece.restored.v1`

Recommended payload:

```json
{
  "workspace_id": "<uuid>",
  "reason": "duplicate cleanup",
  "archived_at": "<iso>"
}
```

Restore payload may omit `reason`.

## Hearth Client Changes

Primary file:

- `apps/hearth/src/lib/hearth-workpieces.ts`

Extend `HearthWorkpieceSummaryApiRow` and `HearthWorkpieceSummary` with:

- `archivedAt`
- `archivedBy`
- `archiveReason`
- `isArchived`

Update `listHearthWorkpieces(workspaceId, options?)` to accept:

- `includeArchived?: boolean`

Add helper methods:

- `archiveHearthWorkpiece({ workspaceId, workpieceId, reason? })`
- `restoreHearthWorkpiece({ workspaceId, workpieceId })`

These should call the canonical Tongs routes, not local storage and not draft APIs.

## Hearth Shell Rewiring

Primary file:

- `apps/hearth/src/routes/HearthShell.tsx`

### Replace Draft-Local Cleanup Authority

Current wrong seam:

- workpiece cards show draft archive/unarchive and `Delete`
- those actions call `saveDraftMeta(draft, { archived: ... })` and `onDeleteDraft(draft)`

Slice 1 should change that:

- workpiece cards use workpiece-level archive/restore actions
- draft-local archive should stop presenting as the main workpiece cleanup affordance
- draft delete should be relabeled as `Delete Draft Buffer` if it remains exposed at all

### Exact UI changes

In the Episodes workpiece list:

- replace `Archive` / `Unarchive` button driven by `draft.archived`
- add `Archive Workpiece` / `Restore Workpiece` driven by `item.isArchived`
- remove plain `Delete` label for draft-buffer deletion

In the filters:

- keep `Show archived`, but make it reflect canonical workpiece archive state instead of draft metadata

In focus mode:

- if the active workpiece is archived, show a restore CTA instead of silently hydrating it as normal
- opening an archived workpiece from the archived list should be allowed, but editing should clearly indicate archived status until restored

### State flow changes

Add shell handlers:

- `onArchiveWorkpiece(item)`
- `onRestoreWorkpiece(item)`

Expected behavior:

1. optimistic busy state only
2. canonical archive/restore request through `hearth-workpieces.ts`
3. refresh workpiece summaries
4. if the active workpiece was archived, return to Episodes list or switch to archived-safe read state

Do not let archive be implemented as:

- local hide only
- draft metadata only
- ready-queue hide

## Ready / Series Interaction Rules

Archived workpieces should not remain visible as normal ready candidates.

Slice 1 handling:

- default ready list queries remain active-only because archived workpieces are excluded from default workpiece listings
- if a workpiece is archived while ready metadata still exists, Hearth should not surface it in the normal ready UI
- restore returns the workpiece to normal episode visibility; ready-state semantics can remain unchanged unless future product rules say archive should also clear ready metadata

Recommended narrow behavior for slice 1:

- archive does not destructively delete ready metadata
- archive hides the workpiece from normal navigation
- restore re-exposes it

## Hard Delete Slice (Later)

Do not implement this in slice 1, but lock the future seam now.

Future additions:

- `GET /tongs/workpieces/:id/delete-eligibility`
- `DELETE /tongs/workpieces/:id`

Eligibility response should evaluate:

- active recording session references
- kept-take receipts
- downstream published references
- destructive authority requirements

Hard delete should remain admin-gated and server-enforced.

## Tests

### Tongs API Tests

Primary file:

- `packages/tongs/tests/workpiece-commit-api.test.mjs`

Add coverage for:

- default episode list excludes archived rows
- `include_archived=1` includes archived rows
- archive route requires editor
- restore route requires editor
- archive appends canonical event
- restore appends canonical event
- archived row retains workspace integrity

### Hearth Confidence Tests

Primary file:

- `apps/hearth/tests/hearth-confidence.test.ts`

Add coverage for:

- archived workpiece parsing
- archive helper emits canonical request
- restore helper emits canonical request
- workpiece list uses canonical archive state, not draft archive metadata

### Browser Proof

Add a small focused browser proof after API/client confidence is stable:

- archive a workpiece from Episodes
- confirm it disappears from default list
- enable `Show archived`
- restore it
- confirm it returns to default list

## Implementation Order

1. migration on `tongs.episodes`
2. extend Tongs episode list query with archive fields and `include_archived`
3. add archive and restore routes
4. add API tests
5. extend Hearth workpiece client
6. rewire Hearth workpiece list/actions
7. relabel or remove misleading draft-level delete/archive buttons
8. add Hearth confidence tests
9. add browser proof

## Exit Criteria

Slice 1 is complete when all of the following are true:

- workpiece archive is canonical Tongs state
- default episode lists exclude archived workpieces
- archived workpieces are visible only when explicitly requested
- restore is canonical and reversible
- workpiece cleanup UI no longer depends on draft-local archive metadata
- draft delete, if still exposed, is clearly labeled as draft-buffer deletion
- archive and restore are covered by API and Hearth confidence tests

Slice 1 meets these criteria. The remaining work belongs to later slices, not to archive-first foundation repair.

## Recommended Next Slice

Recommended next slice: restore reintegration policy.

That slice should answer the post-restore product rules explicitly:

- when a restored workpiece reappears in Ready/session candidate surfaces
- whether restore should preserve prior ready metadata as immediately active or require re-ready
- how archived session-plan references should behave if restored later
- whether cross-tool handoff surfaces should offer restore-and-open affordances or remain restore-first in Hearth only

## Explicit Non-Goals

Do not bundle these into slice 1:

- hard delete
- purge
- fork semantics
- recorded-lineage destruction
- ready-state redesign
- asset cleanup beyond archive-safe hiding
