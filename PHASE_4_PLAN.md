# Hearth Phase 4 Plan

> Historical phase-planning document. Lifecycle details here may be outdated and are superseded by `FORGE_SPARK_TO_ANVIL_LIFECYCLE_CANON.md`.

Date: February 25, 2026  
Branch: `work/hearth-phase4-begin`  
Baseline: `hearth-phase3-complete` (`01eee7b`)

## Purpose

Phase 4 makes Hearth a first-class Forge integration instead of a standalone writer.  
The focus is explicit contracts, deterministic navigation, and workspace-safe cross-tool flows.

## Objectives

- Define and enforce integration contracts between Hearth, Tongs, Anvil, and Bar-Stock.
- Ship one reliable user-visible cross-tool path: Hearth -> Anvil.
- Make spark-to-workpiece creation first-class and traceable.
- Prefer URL-resolved workspace/workpiece context over implicit local state.

## Scope by Slice

### 4.1 Integration Contracts (No New UI)

Primary outcome: stable boundaries and shared types.

- Hearth <-> Tongs contract
- Hearth <-> Anvil handshake
- Hearth <-> Bar-Stock handshake
- Workspace guard compatibility across all entry points

Deliverables:

- Contract document updates in this file (and linked code comments/types).
- Shared type definitions for handshake payloads/results.
- Minimal helper functions for context resolution + handoff URL construction.
- Canonical link helper ownership: `apps/nursery/src/lib/forge-route-context.ts`.
- No visual redesign required.

### 4.2 UX Wiring: Open in Anvil

Primary outcome: one-click handoff with valid context.

- Add `Open in Anvil` action from Hearth.
- Navigate with explicit `workspace_id` and `workpiece_id`.
- Block/notify on invalid context instead of mounting partial state.

Deliverables:

- End-to-end flow from Hearth to Anvil with verified context.
- Error and guard states for missing or inaccessible workspace/workpiece.

### 4.3 Bar-Stock -> Hearth Forge Spark

Primary outcome: sparks become first-class workpieces.

- Create workpiece with origin metadata:
  - `created_from: "bar-stock"`
  - `spark_id: <uuid>`
- Open Hearth directly on that workpiece.
- Ensure initial metadata/script seed exists.

Deliverables:

- Reliable spark-forge flow with deterministic IDs and context.
- Metadata persisted and queryable for provenance.

### 4.4 Deep Links and Cross-Tool Navigation (Follow-On)

Primary outcome: shareable URLs and deterministic restore behavior.

- Standardized query contract:
  - `/apps/hearth?workspace_id=<uuid>&workpiece_id=<uuid>`
  - `/apps/anvil?workspace_id=<uuid>&workpiece_id=<uuid>`
- URL context is authoritative when valid.
- Local storage remains fallback only.

## Integration Surfaces

### Workspace/Identity Guard (All Tools)

- Tools must not mount when `workspace_id` is unresolved.
- If workspace list is non-empty and no selection exists, auto-select first workspace.
- If list is empty, force create/select workflow before tool mount.
- If URL workspace is invalid/inaccessible:
  - replace invalid URL state (do not push history)
  - fall back to valid selected/default workspace with clear user notice

### Canonical Link Model (4.1 Contract)

- Canonical deep-link keys are:
  - `workspace_id`
  - `workpiece_id`
- Legacy aliases may be parsed for compatibility, but all generated links must emit canonical keys.
- Parsing/validation ownership for router handoff lives in:
  - `apps/nursery/src/lib/forge-route-context.ts`
- Route bridges must sanitize invalid context keys before handoff and use replace semantics for URL correction.

### Workpiece Creation Success (4.1 Contract)

A Hearth workpiece creation is considered successful only when all are true:

- Cradle/Episode row creation succeeded.
- `metadata.json` commit succeeded.
- Local last-open pointers were persisted after commit success.

If metadata commit fails, creation is considered failed even if a cradle row exists.

### Hearth <-> Tongs

Hearth writes:

- Workpiece lifecycle events (create/open/update metadata)
- Mode-specific commits (Planning, Sources, Draft) without overwrite coupling
- Source index/issue counts for citation integrity

Hearth expects:

- Canonical workpiece identity + workspace membership authorization
- Durable commit result shape with success/error envelope
- Source and metadata round-trip with version-safe fields

### Hearth <-> Anvil

Handshake contract:

- Input: `workspace_id`, `workpiece_id`, optional open mode
- Output: Anvil opens bound to same context or returns actionable error state

Rules:

- Never open Anvil without a resolved workspace.
- Never rely only on stale local storage for workpiece selection.
- Hearth generated handoff URL contract:
  - `/app/anvil?workspace_id=<uuid>&workpiece_id=<uuid>`
- Nursery Anvil route forwards canonical context to Anvil runtime:
  - `/anvil/teleprompter_pro.html?workspace_id=<uuid>&workpiece_id=<uuid>`
- Invalid/missing workspace context must route through workspace gate before Anvil mount.

### Hearth <-> Bar-Stock

Handshake contract:

- Input: `spark_id`, `workspace_id`
- Output: created/linked `workpiece_id` and navigation to Hearth

Rules:

- Spark provenance must be persisted on workpiece origin metadata.
- Workpiece creation failure must not leave partial local selection state.

## Integration Checklist (4.1)

- [x] Create spark -> Forge in Hearth -> open workpiece -> refresh -> same workpiece still opens.
- [x] From Hearth active workpiece, open Anvil -> correct workspace/workpiece context is preserved.
- [x] Launch tool route with no workspace (`/app/hearth` or `/app/anvil`) -> workspace-required gate blocks mount.
- [x] Launch with invalid `workspace_id` query -> URL self-heals via replace and does not add back-button spam.

## Acceptance Criteria

### 4.1 Done Means

- [x] Shared contract types exist and are used by integration call sites.
- [x] Handoff helpers produce deterministic URLs with `workspace_id` and `workpiece_id`.
- [x] Workspace guard behavior is consistent for Hearth, Anvil, Bar-Stock entry points.
- [x] Invalid URL workspace handling converges (no infinite resolving, no history spam).
- [x] Lint, typecheck, and gate pass.

### 4.2 Done Means

- [x] `Open in Anvil` is available from Hearth with valid context.
- [x] Anvil opens the intended workpiece in the intended workspace.
- [x] Missing/invalid context shows explicit UX error state (not blank/partial mount).
- [x] Reload/deep-link preserves context.
- [x] Lint, typecheck, and gate pass.

### 4.3 Done Means

- [x] Spark forge action creates a workpiece with provenance metadata.
- [x] Hearth opens directly on the new workpiece.
- [x] Minimal script/metadata seed exists after forge.
- [x] Failure paths roll back/avoid stale local selected workpiece state.
- [x] Lint, typecheck, and gate pass.

## Phase v1 Closeout Checklist (2026-02-28)

Execution order for final Phase v1 closure:

- [x] Close stale-local-state gap in Hearth forge failure paths (do not persist/select partial workpiece IDs on failed create).
- [x] Guarantee minimal script seed at forge time (metadata + initial script artifact committed before success is acknowledged).
- [x] Tighten `Open in Anvil` UX guards in Hearth (explicit user-facing errors for missing workspace/workpiece context).
- [x] Tighten Anvil boot handoff errors (explicit unauthorized/not-found/error signal when script autoload fails).
- [x] Complete Anvil ready-scripts dropdown integration against Tongs ready-scripts API (including primary path parsing and unrecorded queue behavior).
- [x] Re-run targeted validation:
  - [x] `pnpm --filter @forge/tongs test:commit-api`
  - [x] `pnpm --filter @nursery/hearth build`
  - [x] `pnpm --filter teleprompter build:ts`
  - [x] `pnpm run gate`
- [x] Browser verification (automated via `pnpm smoke:hearth-phase4:gate` / `pnpm --filter nursery test:playwright:hearth-phase4` with provisioned Playwright auth + fixture env):
  - [x] Spark -> Forge in Hearth -> refresh -> same workpiece reopens
  - [x] Hearth `Open in Anvil` loads expected script without paste fallback
  - [x] Anvil Ready Scripts dropdown shows approved-unrecorded scripts in active workspace

## Notes

- Keep changes thin and production-safe; avoid broad refactors unrelated to the contracts.
- Treat this document as the Phase 4 execution anchor and update checkboxes as slices land.
