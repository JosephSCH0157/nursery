# Hearth + Tongs Phase 5 Slice 1 Repo Lock

> Scope note: this document constrains repo boundary behavior only. Lifecycle semantics are defined in `FORGE_SPARK_TO_ANVIL_LIFECYCLE_CANON.md`.

Date: March 10, 2026  
Slice: Phase 5 Slice 1 - canonical image-map asset

This document locks the Hearth image-map repo seam before implementation.

## Purpose

Keep `HearthShell.tsx` as a consumer of a focused image-map capability, not the place where:

- Tongs request bodies are assembled
- metadata timestamps are tracked ad hoc
- conflict semantics are interpreted ad hoc
- asset row behavior is reasoned about
- package vs asset state is coordinated manually

The repo seam owns that client-side complexity.

## Repo File

Preferred file:

- `apps/hearth/src/lib/hearth-image-map-repo.ts`

Slice 1 should not fold this into a generic asset repo.

## Exact Repo Surface

The repo surface must stay narrow.

### Read

```ts
getWorkpieceImageMap(workpieceId: string): Promise<GetWorkpieceImageMapResult>
```

### Save

```ts
saveWorkpieceImageMap(args: {
  workpieceId: string;
  workspaceId: string;
  entries: EpisodeImageMapEntry[];
  expectedMetadataUpdatedAt?: string | null;
}): Promise<SaveWorkpieceImageMapResult>
```

### Refresh

No separate `refreshImageMap()` method is required in Slice 1.

`getWorkpieceImageMap()` is the refresh path.

## Exact Returned Shape

The shell should receive one repo-owned view model, not raw Tongs response bodies.

### Shared View Model

```ts
type WorkpieceImageMapView = {
  workpieceId: string;
  workspaceId: string;
  entries: EpisodeImageMapEntry[];
  metadataUpdatedAt: string | null;
  asset: {
    id: string;
    path: "assets/image-map/image-map.v1.json";
    assetKind: "image_map_json";
    status: "ready";
    storageBucket: string;
    storageKey: string;
    entryCount: number;
    updatedAt: string;
    supersedesAssetId: string | null;
  } | null;
}
```

### Read Result

```ts
type GetWorkpieceImageMapResult =
  | { ok: true; imageMap: WorkpieceImageMapView }
  | { ok: false; status: number; reason: string };
```

### Save Result

```ts
type SaveWorkpieceImageMapResult =
  | { ok: true; imageMap: WorkpieceImageMapView }
  | { ok: false; status: number; reason: "request_failed" | "conflict" | "invalid_response"; latest?: WorkpieceImageMapView };
```

## Save Contract

The repo takes semantic entries only.

The repo must:

1. send `workspace_id`
2. send `entries`
3. send `expected_metadata_updated_at` when present
4. call the focused Tongs `PUT /tongs/workpieces/:id/image-map` route
5. normalize the response into the repo view model

The repo must not:

- build `assets/image-map/image-map.v1.json`
- construct asset row metadata client-side
- infer supersession from local state

All derivation remains server-side.

## Conflict Behavior

Slice 1 conflict handling must be explicit.

### Locked Behavior

On `409 image_map_conflict`:

- repo returns `{ ok: false, status: 409, reason: "conflict", latest? }`

If the server response includes enough latest state to normalize, the repo may populate `latest`.

If not, the repo may perform one immediate follow-up `GET /tongs/workpieces/:id/image-map` read and return that as `latest`.

### Shell Rule

The shell must not interpret raw `409` bodies directly.

It only reacts to the repo’s structured `reason: "conflict"` result.

## Cache / Refresh Expectations

Slice 1 should stay simple.

### Locked Rule

The repo is read-through, not stateful.

That means:

- `getWorkpieceImageMap()` always reads from server truth
- `saveWorkpieceImageMap()` returns server truth from the save response
- no in-memory cache layer is introduced in Slice 1
- no localStorage fallback exists

### Why

Steps 1 through 4 already removed fake authority systems. Slice 1 must not reintroduce one for image-map assets.

## Error Semantics

The repo should collapse raw transport details into a small result vocabulary.

### Preferred `reason` values

- `request_failed`
- `conflict`
- `invalid_response`

The repo may preserve `status` for UI messaging and debugging, but the shell should not need to parse Tongs error codes to know what happened.

## Package Coupling Rules

The repo may normalize the returned image-map view for the shell, but it must not silently update unrelated episode package fields.

### Explicitly Forbidden

- hidden writes to thumbnail fields
- hidden writes to SEO fields
- generic metadata patching outside the image-map scope
- mutating shell-owned draft or revision state

This repo exists for one feature slice only.

## Non-Goals

This repo seam must not add:

- generic asset management APIs
- thumbnail + image-map abstraction sharing in Slice 1
- local cache invalidation framework
- optimistic local persistence authority
- batched workpiece metadata repos

## Shell Impact

After this repo exists, `HearthShell.tsx` should only need to:

- call `getWorkpieceImageMap(workpieceId)` on load/refresh
- call `saveWorkpieceImageMap(...)` on image-map write actions
- update local `episodePackage.image_map.entries` from repo response
- react to `reason: "conflict"` with refresh/reload UX

The shell should not:

- build request bodies by hand
- track raw Tongs timestamps outside the repo result
- reason about `supersedes_asset_id`
- inspect raw asset rows

## Tests For The Repo Seam

The repo should be covered in `apps/hearth/tests/hearth-confidence.test.ts`.

Minimum proof:

- read result normalizes semantic entries + asset summary
- save result forwards `expected_metadata_updated_at`
- conflict result returns `reason: "conflict"`
- optional follow-up refresh on conflict yields latest server truth
- invalid response becomes `reason: "invalid_response"`
- no code path uses local-only persistence

## Locked Summary

Slice 1 repo seam is:

- one narrow image-map-specific client module
- one read method
- one save method
- semantic entries only in
- normalized view model out
- explicit conflict result
- no cache/local authority
- no generic asset abstraction
