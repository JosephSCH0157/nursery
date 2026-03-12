# Hearth + Tongs Phase 5 Slice 1 Migration Lock

> Scope note: this document constrains migration/schema behavior only. Lifecycle semantics are defined in `FORGE_SPARK_TO_ANVIL_LIFECYCLE_CANON.md`.

Date: March 10, 2026  
Slice: Phase 5 Slice 1 - canonical image-map asset

This requires a DB migration / RLS update.

This document locks the Slice 1 schema change before any SQL lands.

## Purpose

Add the minimum database support required for `image_map_json` to live in the existing `tongs.assets` spine.

The migration must be narrow:

- support one new derived asset kind: `image_map_json`
- keep existing thumbnail asset behavior intact
- avoid a generic asset-system overhaul

## Existing Table Problem

Current `tongs.assets` is still thumbnail-centric:

- `prompt` is required
- there is no `asset_kind`
- there is no asset lifecycle/status field
- there is no structured metadata field for non-thumbnail assets
- there is no supersession link for “current canonical asset” semantics

That is sufficient for generated thumbnails, but not for a canonical image-map handoff artifact.

## Locked Migration Shape

### Columns To Add / Change

1. Make `prompt` nullable

```sql
alter table tongs.assets
  alter column prompt drop not null;
```

Reason:

- `image_map_json` does not have an AI prompt
- existing thumbnail rows already have prompt data

2. Add `asset_kind`

```sql
alter table tongs.assets
  add column asset_kind text not null default 'thumbnail_image';
```

3. Add `status`

```sql
alter table tongs.assets
  add column status text not null default 'ready';
```

4. Add `metadata_json`

```sql
alter table tongs.assets
  add column metadata_json jsonb not null default '{}'::jsonb;
```

5. Add `supersedes_asset_id`

```sql
alter table tongs.assets
  add column supersedes_asset_id uuid null references tongs.assets(id) on delete set null;
```

### Exact Constraints

```sql
alter table tongs.assets
  add constraint assets_prompt_nullable_nonempty_check
  check (prompt is null or btrim(prompt) <> '');

alter table tongs.assets
  add constraint assets_asset_kind_check
  check (asset_kind in ('thumbnail_image', 'image_map_json'));

alter table tongs.assets
  add constraint assets_status_check
  check (status in ('ready', 'superseded'));

alter table tongs.assets
  add constraint assets_kind_shape_check
  check (
    (asset_kind = 'thumbnail_image' and prompt is not null)
    or
    (asset_kind = 'image_map_json' and mime_type = 'application/json' and prompt is null)
  );
```

### Exact Indexes

```sql
create index if not exists assets_workpiece_kind_status_created_idx
  on tongs.assets (workpiece_id, asset_kind, status, created_at desc);

create index if not exists assets_workspace_kind_status_created_idx
  on tongs.assets (workspace_id, asset_kind, status, created_at desc);

create index if not exists assets_supersedes_asset_idx
  on tongs.assets (supersedes_asset_id)
  where supersedes_asset_id is not null;

create unique index if not exists assets_ready_image_map_unique_idx
  on tongs.assets (workpiece_id, asset_kind)
  where asset_kind = 'image_map_json' and status = 'ready';
```

## Exact RLS Impact

No new RLS model is introduced in Slice 1.

The locked RLS posture is:

- keep existing workspace-scoped `select`, `insert`, `update`, and `delete` policies on `tongs.assets`
- do not add asset-kind-specific policies in Slice 1
- do not add service-role-only behavior in Slice 1

So the migration should not change policy logic unless the table alter requires policy recreation syntax in the target environment.

## Exact Slice 1 Value Conventions

These values are locked for the new image-map asset rows:

- `asset_kind = 'image_map_json'`
- `status = 'ready'` for the current canonical image-map asset
- prior rows for the same workpiece move to `status = 'superseded'`
- `mime_type = 'application/json'`
- `provider = 'hearth'`
- `path = 'assets/image-map/image-map.v1.json'`
- `prompt = null`

### `metadata_json` shape for `image_map_json`

Locked minimum shape:

```json
{
  "schema": "forge.image-map.v1",
  "entry_count": 3
}
```

Optional later additions may include event metadata, but Slice 1 should not require more than this.

## Path Policy Lock

Slice 1 intentionally accepts this tradeoff:

- current canonical handoff path is fixed at `assets/image-map/image-map.v1.json`
- `supersedes_asset_id` preserves row lineage
- superseded rows do **not** guarantee immutable historical blob preservation in Slice 1

That means Slice 1 preserves:

- current canonical asset queryability
- current asset lineage

It does **not** preserve:

- immutable historical image-map file snapshots

Immutable snapshot paths, if needed, are deferred to a later slice.

## Exact Non-Goals For This Migration

This migration must **not** do any of the following:

- create a new `workpiece_assets` table
- add a generic `source_tool` column
- add a generic `derivation_kind` column
- add primary-asset pointer columns
- add support for chapter, shorts, description, or transcript assets
- redesign thumbnail version history
- add background asset jobs
- change `tongs.workpiece_files` or `tongs.workpiece_events` schema

## Exact Follow-On App Code Changes Required

Once the migration is applied, these code changes are required to use it:

1. Regenerate database types in [db.types.ts](/d:/nursery/nursery/packages/tongs/src/db.types.ts)
2. Update thumbnail asset inserts in [workpiece-commit-api.ts](/d:/nursery/nursery/packages/tongs/src/workpiece-commit-api.ts) to set:
   - `asset_kind: 'thumbnail_image'`
   - `status: 'ready'`
   - `metadata_json: '{}'`
3. Add focused Tongs image-map read/save endpoints in [workpiece-commit-api.ts](/d:/nursery/nursery/packages/tongs/src/workpiece-commit-api.ts)
4. Add a focused Hearth client seam, likely `apps/hearth/src/lib/hearth-image-map-repo.ts`
5. Rewire image-map save actions in [HearthShell.tsx](/d:/nursery/nursery/apps/hearth/src/routes/HearthShell.tsx)
6. Add API, confidence, browser, and gate proof for the new asset path

## Exact SQL Draft

This is the locked SQL draft for the migration:

```sql
begin;

alter table tongs.assets
  alter column prompt drop not null;

alter table tongs.assets
  add column if not exists asset_kind text not null default 'thumbnail_image',
  add column if not exists status text not null default 'ready',
  add column if not exists metadata_json jsonb not null default '{}'::jsonb,
  add column if not exists supersedes_asset_id uuid null references tongs.assets(id) on delete set null;

alter table tongs.assets
  drop constraint if exists assets_prompt_nullable_nonempty_check,
  add constraint assets_prompt_nullable_nonempty_check
    check (prompt is null or btrim(prompt) <> ''),
  drop constraint if exists assets_asset_kind_check,
  add constraint assets_asset_kind_check
    check (asset_kind in ('thumbnail_image', 'image_map_json')),
  drop constraint if exists assets_status_check,
  add constraint assets_status_check
    check (status in ('ready', 'superseded')),
  drop constraint if exists assets_kind_shape_check,
  add constraint assets_kind_shape_check
    check (
      (asset_kind = 'thumbnail_image' and prompt is not null)
      or
      (asset_kind = 'image_map_json' and mime_type = 'application/json' and prompt is null)
    );

create index if not exists assets_workpiece_kind_status_created_idx
  on tongs.assets (workpiece_id, asset_kind, status, created_at desc);

create index if not exists assets_workspace_kind_status_created_idx
  on tongs.assets (workspace_id, asset_kind, status, created_at desc);

create index if not exists assets_supersedes_asset_idx
  on tongs.assets (supersedes_asset_id)
  where supersedes_asset_id is not null;

create unique index if not exists assets_ready_image_map_unique_idx
  on tongs.assets (workpiece_id, asset_kind)
  where asset_kind = 'image_map_json' and status = 'ready';

commit;
```

This lock is intentionally narrow. If a later change needs broader asset taxonomy, it should be a later migration, not hidden inside Slice 1.
