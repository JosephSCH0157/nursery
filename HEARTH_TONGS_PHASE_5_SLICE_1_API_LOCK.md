# Hearth + Tongs Phase 5 Slice 1 API Lock

Date: March 10, 2026  
Slice: Phase 5 Slice 1 - canonical image-map asset

This requires a DB migration / RLS update.

This document locks the focused Tongs image-map API seam before implementation.

## Purpose

Define one narrow server seam for Slice 1:

- `GET /tongs/workpieces/:id/image-map`
- `PUT /tongs/workpieces/:id/image-map`

The seam must:

- preserve `episode.image_map.entries` as semantic source of truth
- derive `assets/image-map/image-map.v1.json` on the server
- register/query the current derived asset through the extended `tongs.assets` table
- expose one composed read surface to Hearth

## Route Summary

### Read

- `GET /tongs/workpieces/:id/image-map`

### Write

- `PUT /tongs/workpieces/:id/image-map`

Both routes are authenticated and membership-scoped through the existing Tongs access model.

## Auth / Access Rules

### Header

Both routes require the existing user token header:

- `x-forge-user-authorization: Bearer <token>`

### Membership

The authenticated user must be a member of the target workspace.

### Edit Role

`PUT` must require editor-or-better workspace access.

`GET` may require viewer-or-better access.

No route-specific access model beyond existing workspace role semantics should be introduced in Slice 1.

## GET Contract

### Purpose

Return one composed Slice 1 view from canonical state.

This route is not just “read the derived file” and not just “read package semantics.” It returns both:

- semantic truth from the normalized episode package
- the current canonical derived asset summary, if present

### Exact Response Shape

```ts
type GetWorkpieceImageMapResponse = {
  ok: true;
  data: {
    image_map: {
      workpiece_id: string;
      workspace_id: string;
      entries: EpisodeImageMapEntry[];
      metadata_updated_at: string | null;
    };
    asset: {
      id: string;
      asset_kind: "image_map_json";
      status: "ready";
      path: "assets/image-map/image-map.v1.json";
      storage_bucket: string;
      storage_key: string;
      metadata_json: {
        schema: "forge.image-map.v1";
        entry_count: number;
      };
      created_at: string;
      updated_at: string;
      supersedes_asset_id: string | null;
    } | null;
  };
}
```

### No-Image-Map-Yet Behavior

If no image map exists yet:

- `entries` returns `[]`
- `metadata_updated_at` returns the current `metadata.json` updated timestamp if metadata exists, otherwise `null`
- `asset` returns `null`

This is not an error.

### Read Rule

The route must normalize the package from `metadata.json` first.

The `asset` field is supplementary derived-state summary, not the semantic source.

## PUT Contract

### Purpose

Save semantic image-map entries and derive the canonical handoff artifact on the server.

The client sends semantic entries only. The server is responsible for:

- package write
- asset JSON derivation
- asset row supersession
- response composition

### Exact Request Shape

```ts
type SaveWorkpieceImageMapRequest = {
  workspace_id: string;
  entries: EpisodeImageMapEntry[];
  expected_metadata_updated_at?: string | null;
}
```

### Exact Response Shape

```ts
type SaveWorkpieceImageMapResponse = {
  ok: true;
  data: {
    image_map: {
      workpiece_id: string;
      workspace_id: string;
      entries: EpisodeImageMapEntry[];
      metadata_updated_at: string;
    };
    asset: {
      id: string;
      asset_kind: "image_map_json";
      status: "ready";
      path: "assets/image-map/image-map.v1.json";
      storage_bucket: string;
      storage_key: string;
      metadata_json: {
        schema: "forge.image-map.v1";
        entry_count: number;
      };
      created_at: string;
      updated_at: string;
      supersedes_asset_id: string | null;
    };
  };
}
```

### Validation Rules

`PUT` must validate:

- route `workpiece_id` is a valid UUID
- `workspace_id` is a valid UUID
- target workpiece belongs to `workspace_id`
- `entries` is an array
- entries normalize cleanly into valid `EpisodeImageMapEntry[]`
- each `id` is unique after normalization
- each `anchor` is non-empty after normalization
- `expected_metadata_updated_at`, if present, is a valid ISO timestamp

### Client Payload Rule

The client must not send:

- derived asset JSON
- asset row metadata
- storage keys
- status flags

All derivation remains server-side.

## Write Order

The write order is locked for Slice 1.

1. validate request and access
2. read current `metadata.json`
3. normalize existing package
4. if `expected_metadata_updated_at` is present, compare against current metadata/file timestamp and fail on mismatch
5. replace `episode.image_map.entries` with normalized submitted entries
6. write updated `metadata.json`
7. build derived `assets/image-map/image-map.v1.json`
8. mark prior current `image_map_json` asset row as `superseded`
9. commit the derived asset file at the fixed path
10. insert the new `tongs.assets` row with `asset_kind = 'image_map_json'`
11. return the composed response

## Success Definition

`PUT` is successful only if:

- semantic package write succeeded
- derived artifact file write succeeded
- asset row write succeeded

If any later step fails, the server must not return success.

Slice 1 does not promise a cross-table/database transaction. It does require success semantics to mean “package + derived asset + asset row are all consistent.”

## Asset Row Behavior

Slice 1 locks this asset-row lifecycle:

- at most one `image_map_json` asset row per workpiece may have `status = 'ready'`
- each successful save inserts a new current row
- the previous current row becomes `status = 'superseded'`
- the new row’s `supersedes_asset_id` points to the previous current row if one existed

### Fixed Path Rule

The asset file path remains fixed:

- `assets/image-map/image-map.v1.json`

That means current-canonical asset semantics are path-stable, while lineage is row-based.

## Conflict Semantics

Slice 1 should use optimistic concurrency.

### Request Field

The client may send:

- `expected_metadata_updated_at`

### Conflict Rule

If the current metadata timestamp does not match `expected_metadata_updated_at`, the server must reject the save with `409 conflict`.

### Exact Conflict Response

```ts
type SaveWorkpieceImageMapConflict = {
  ok: false;
  error: {
    code: "image_map_conflict";
    message: "Image map changed since last load.";
    details: {
      expected_metadata_updated_at: string | null;
      current_metadata_updated_at: string | null;
    };
  };
}
```

### Client Rule

On conflict:

- Hearth refreshes from latest canonical truth
- user retries from refreshed state

The server must not silently last-write-wins over an explicit stale timestamp.

### No-Version-Header Rule

Slice 1 should not invent a second version token/header system if the existing metadata/file timestamp is enough.

## Error Semantics

Use existing Tongs error envelope style:

```ts
{
  ok: false,
  error: {
    code: string,
    message: string,
    details?: Record<string, unknown>
  }
}
```

Likely error codes:

- `unauthorized`
- `workspace_not_found`
- `workpiece_not_found`
- `workspace_mismatch`
- `invalid_entries`
- `duplicate_entry_id`
- `invalid_timestamp`
- `image_map_conflict`
- `db_read_failed`
- `db_write_failed`
- `storage_write_failed`

## Non-Goals For This API Seam

This seam must not add:

- generic asset listing/search endpoints
- batch asset save APIs
- multi-artifact save endpoints
- immutable historical image-map blob retrieval contracts
- thumbnail or unrelated asset refactors piggybacking on the route
- browser-generated canonical artifact payloads

## App Code Impact

This API seam implies the following follow-on app changes:

1. add focused service methods in [workpiece-commit-api.ts](/d:/nursery/nursery/packages/tongs/src/workpiece-commit-api.ts)
2. add matching tests in [workpiece-commit-api.test.mjs](/d:/nursery/nursery/packages/tongs/tests/workpiece-commit-api.test.mjs)
3. add Hearth client repo methods in `apps/hearth/src/lib/hearth-image-map-repo.ts`
4. rewire current image-map save actions in [HearthShell.tsx](/d:/nursery/nursery/apps/hearth/src/routes/HearthShell.tsx)
5. add confidence and browser proof on top of this route

## Locked Summary

Slice 1 image-map API is:

- one composed read route
- one semantic-write route
- server-side derivation only
- one current ready asset row
- explicit supersession
- optimistic conflict rejection
- no generic asset-system sprawl
