# Hearth + Tongs Phase 5 Slice 1 Plan

> Scope note: lifecycle assumptions in this plan are superseded by `FORGE_SPARK_TO_ANVIL_LIFECYCLE_CANON.md`.

Date: March 10, 2026  
Theme: `Phase 5 - Workpiece Intelligence`  
Slice: Canonical image-map asset through Tongs assets + episode package V2

## Purpose

Slice 1 makes the image map a canonical handoff artifact without creating a second editorial truth system.

The rule for this slice is:

- Hearth still edits image-map semantics inside `forge.episode.package.v2`.
- Tongs persists a canonical derived image-map asset for downstream tools.
- The asset is indexed through the existing asset spine, not a parallel registry.

This keeps the editable source in one place and gives Hammer/Quench-facing tooling a stable, queryable artifact.

## Semantic Contract

### Locked Source Of Truth

The semantic source of truth remains:

- `episode.image_map.entries` inside `metadata.json`
- normalized through `forge.episode.package.v2`

Slice 1 must not introduce a second editable image-map source.

### New Canonical Handoff Artifact

Slice 1 adds one canonical derived artifact:

- `assets/image-map/image-map.v1.json`

This file is:

- workpiece-scoped
- generated from the current normalized `episode.image_map.entries`
- persisted canonically in Tongs
- registered in `tongs.assets`

### Asset Kind

The first Phase 5 asset kind is:

- `image_map_json`

This is the only new derived asset kind in Slice 1.

### Non-Goals

Slice 1 does not:

- redesign the image-map editor UI
- move image-map editing out of Hearth
- make Hammer consume the artifact yet
- add general-purpose asset generation for every Hearth output

## Why This Slice First

Image map is the best first derived editorial asset because it is:

- already workpiece-scoped
- already structurally present in Hearth
- already reflected in the episode package
- useful for downstream production prep
- deterministic enough to test cleanly

## Canonical File + Package Rules

### Package Rule

`forge.episode.package.v2` remains schema-stable for Slice 1.

That means:

- `episode.image_map.entries` stays the editable semantic field
- no package schema bump is required just to add the derived asset

### Export Rule

`assets/image-map/image-map.v1.json` is a derived handoff artifact generated from the package.

It must mirror the normalized package entries exactly enough that downstream tools can rely on it.

### No Split-Brain Rule

If the image-map asset exists, it must have been generated from the current saved package state.

The asset must never become fresher than the package, and the package must never rely on the asset to reconstruct semantics.

## Migration / RLS Shape

This slice requires a DB migration / RLS update.

### Reason

The existing `tongs.assets` table is still too thumbnail-centric:

- `prompt` is required
- there is no generic `asset_kind`
- there is no derivation/source metadata for non-thumbnail derived assets

That is not sufficient for canonical editorial assets like `image_map_json`.

### Exact Model Extension

Preferred migration direction:

1. Alter `tongs.assets.prompt` to nullable
2. Add:
   - `asset_kind text not null default 'generic'`
   - `source_tool text not null default 'user'`
   - `derivation_kind text not null default 'manual'`
   - `status text not null default 'ready'`
   - `metadata_json jsonb not null default '{}'::jsonb`
   - `supersedes_asset_id uuid null references tongs.assets(id) on delete set null`
3. Add checks:
   - `asset_kind <> ''`
   - `source_tool <> ''`
   - `derivation_kind <> ''`
   - `status in ('draft', 'ready', 'superseded', 'failed')`
4. Add indexes:
   - `(workpiece_id, asset_kind, created_at desc)`
   - `(workspace_id, asset_kind, created_at desc)`
   - `(supersedes_asset_id)` if needed

### RLS

Because this slice extends the existing `tongs.assets` table, workspace-based RLS semantics should remain the same:

- select/update/delete remain membership-scoped by `workspace_id`
- insert remains membership-scoped by `workspace_id`

No new access model should be introduced in Slice 1.

## Tongs API Seam

Slice 1 needs a focused server seam rather than pushing image-map asset lifecycle into the generic `commit-file` caller.

### New Service Behavior

Add a focused Tongs service path that:

1. validates `workspace_id` + `workpiece_id`
2. reads current `metadata.json`
3. normalizes the episode package
4. replaces `episode.image_map.entries` with the submitted entries
5. builds `assets/image-map/image-map.v1.json`
6. commits updated `metadata.json`
7. commits the derived image-map asset file
8. supersedes any prior `image_map_json` asset rows for the same workpiece
9. inserts a new `tongs.assets` row for the current asset
10. returns updated package + current asset record

### Recommended Endpoint

Recommended focused endpoint:

- `PUT /tongs/workpieces/:id/image-map`

Recommended read endpoint:

- `GET /tongs/workpieces/:id/image-map`

### Request Shape

Recommended save request:

```ts
type SaveWorkpieceImageMapRequest = {
  workspace_id: string;
  entries: EpisodeImageMapEntry[];
}
```

### Response Shape

Recommended response:

```ts
type SaveWorkpieceImageMapResponse = {
  episode_package: EpisodePackageRecord;
  asset: {
    id: string;
    path: string;
    asset_kind: "image_map_json";
    status: "ready";
    storage_bucket: string;
    storage_key: string;
    metadata_json: Record<string, unknown>;
  };
}
```

### Event Shape

Recommended event family:

- `hearth.image_map.asset.saved.v1`
- `hearth.image_map.asset.superseded.v1`

### Deterministic Query Rule

The current image-map asset for a workpiece is:

- the latest `image_map_json` asset row with `status = 'ready'`

Older image-map rows must be marked `superseded`, not deleted.

## Hearth UI / Action Seam

Slice 1 should replace the current generic metadata write path for image-map actions with a slice-specific save path.

### Current State

Today image-map actions in [HearthShell.tsx](/d:/nursery/nursery/apps/hearth/src/routes/HearthShell.tsx) call [saveEpisodePackageForWorkpiece()](/d:/nursery/nursery/apps/hearth/src/lib/hearth-thumbnail-api.ts), which only commits `metadata.json`.

That is no longer enough for Slice 1 because the image map must also produce a canonical asset row and file.

### Required Client Seam

Add a focused Hearth repo/client module, preferably in:

- `apps/hearth/src/lib/hearth-image-map-repo.ts`

Functions:

- `readWorkpieceImageMap(workpieceId)`
- `saveWorkpieceImageMap({ workspaceId, workpieceId, entries, eventName, eventPayload })`

### Shell Rewiring

Replace image-map save call sites in [HearthShell.tsx](/d:/nursery/nursery/apps/hearth/src/routes/HearthShell.tsx):

- autosave entry edits
- create entry
- duplicate entry
- delete entry
- seed from script

The shell should:

- keep using `episodePackage.image_map.entries` as UI state
- save through the new focused repo call
- update local package state from server response
- optionally expose “saved to canonical asset” status, but not invent a second local asset state

### Explicitly Forbidden

- No local-only export file acting as persistence
- No second client-side image-map authority object
- No direct asset-row writes from the browser outside the Tongs API seam

## Package Integration Seam

Slice 1 package proof is about semantic alignment, not a schema redesign.

### Rule

The saved image-map asset must be generated from the normalized package representation.

That means:

- server save path must normalize entries the same way package V2 does
- asset export shape must be deterministic from normalized entries
- package readback and asset readback must agree

### Export Contract

Recommended asset document shape:

```json
{
  "schema": "forge.image-map.v1",
  "workpiece_id": "<uuid>",
  "entries": [
    {
      "id": "image-map-01",
      "anchor": "s1:para1",
      "description": "wide city skyline at dusk",
      "intent": "broll",
      "source_type": "stock",
      "placement_hint": "after-hook"
    }
  ]
}
```

This is the handoff artifact, not the editable package source.

## Tests / Proof Obligations

Slice 1 closes only with proof at three levels.

### 1. API / Storage Proof

In `packages/tongs/tests/workpiece-commit-api.test.mjs`:

- `PUT /tongs/workpieces/:id/image-map` writes updated package + asset file + asset row
- prior `image_map_json` asset rows become `superseded`
- `GET /tongs/workpieces/:id/image-map` returns current package entries and current ready asset
- workspace mismatch is rejected
- non-member access is rejected by existing workspace-scoped RLS behavior

### 2. Hearth Confidence Proof

In `apps/hearth/tests/hearth-confidence.test.ts`:

- image-map export document is deterministic from package entries
- save repo parses current asset metadata correctly
- package roundtrip keeps image-map entries stable
- save path is remote-first and not local-only
- current asset readback matches package entries

### 3. Browser Proof

In Nursery Playwright:

- user edits or seeds image-map entries in Hearth
- refresh preserves entries
- reopening the workpiece shows the same entries
- canonical asset exists through the Tongs read surface and matches the saved package

## Gate Obligations

Slice 1 is not done until these are green:

- `pnpm --filter @forge/tongs test:commit-api`
- `pnpm --filter @nursery/hearth test:confidence`
- `pnpm --filter @nursery/hearth build`
- one browser proof in the existing Nursery Playwright fixture lane
- root `pnpm gate`

## Exit Criteria

Slice 1 is complete only when all of these are true:

- Image-map semantics remain authoritative in `forge.episode.package.v2`
- A canonical `image_map_json` asset is persisted for the workpiece
- That asset is indexed through `tongs.assets`
- Refresh and second-client reads return the same image-map state
- Older image-map assets are superseded, not deleted
- No local-only export path acts as persistence authority
- Tests and gate proof cover the storage seam, package seam, and browser seam

## Recommended Implementation Order

1. lock and apply the `tongs.assets` migration
2. add focused Tongs image-map save/read service methods
3. add Hearth image-map repo client
4. rewire Hearth image-map save actions
5. add API tests
6. add Hearth confidence tests
7. add browser proof
8. rerun root gate
