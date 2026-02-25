# Hearth Phase 4 Plan

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

### Hearth <-> Bar-Stock

Handshake contract:

- Input: `spark_id`, `workspace_id`
- Output: created/linked `workpiece_id` and navigation to Hearth

Rules:

- Spark provenance must be persisted on workpiece origin metadata.
- Workpiece creation failure must not leave partial local selection state.

## Acceptance Criteria

### 4.1 Done Means

- [ ] Shared contract types exist and are used by integration call sites.
- [ ] Handoff helpers produce deterministic URLs with `workspace_id` and `workpiece_id`.
- [ ] Workspace guard behavior is consistent for Hearth, Anvil, Bar-Stock entry points.
- [ ] Invalid URL workspace handling converges (no infinite resolving, no history spam).
- [ ] Lint, typecheck, and gate pass.

### 4.2 Done Means

- [ ] `Open in Anvil` is available from Hearth with valid context.
- [ ] Anvil opens the intended workpiece in the intended workspace.
- [ ] Missing/invalid context shows explicit UX error state (not blank/partial mount).
- [ ] Reload/deep-link preserves context.
- [ ] Lint, typecheck, and gate pass.

### 4.3 Done Means

- [ ] Spark forge action creates a workpiece with provenance metadata.
- [ ] Hearth opens directly on the new workpiece.
- [ ] Minimal script/metadata seed exists after forge.
- [ ] Failure paths roll back/avoid stale local selected workpiece state.
- [ ] Lint, typecheck, and gate pass.

## Notes

- Keep changes thin and production-safe; avoid broad refactors unrelated to the contracts.
- Treat this document as the Phase 4 execution anchor and update checkboxes as slices land.
