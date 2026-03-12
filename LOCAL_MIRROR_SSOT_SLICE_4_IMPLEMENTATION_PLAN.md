# Local Mirror SSOT Slice 4 Implementation Plan

Implementation plan only. Constitutional lifecycle semantics are defined in `FORGE_SPARK_TO_ANVIL_LIFECYCLE_CANON.md`. Operational lifecycle behavior is summarized in `STATE_MACHINE_DIAGRAM.md`. Mirror-authority policy is defined in `LOCAL_MIRROR_SSOT_BURNDOWN_LOCK.md`. Slice 4 derived-artifact rules are locked in `LOCAL_MIRROR_SSOT_SLICE_4_DERIVED_ARTIFACT_LOCK.md`. Mirror intake transition rules are defined in `LOCAL_MIRROR_INGEST_STATE_MACHINE.md`.

Slice 4 status: completed on 2026-03-11.

Completion note:

- `LOCAL_MIRROR_SSOT_SLICE_4_COMPLETION.md`

**Canonical state alone determines derived artifact presence, attachment, and freshness.**

## Purpose

Implement Slice 4 so derived artifact truth no longer depends on stale local residue, remembered client attachment, optimistic previews that outlive canonical settle, or mirror-presence shortcuts that impersonate canonical artifact state.

This slice should make derived artifacts tell the same truth across refresh, second client, workspace change, workpiece change, and mirror-intake confirmation.

## Scope

In scope:

- thumbnail presence and current-version display
- image-map presence, attachment, and freshness
- metadata-derived output display and package-derived readbacks
- package-vs-asset reconciliation after save, refresh, and second-client open
- mirror-intake transition from staged local file to canonical artifact truth
- reconciliation of transient previews against canonical artifact state

Out of scope:

- new lifecycle policy outside derived artifact truth
- broad offline redesign
- generic asset-system expansion unrelated to current concrete seams
- cross-tool handoff redesign outside artifact truth
- mirror-intake automation beyond the narrow detect -> stage -> canonicalize -> attach -> confirm machine

## Core Decisions

### 1. Presence

Question:

- How does the app determine that a derived artifact exists, and how do we prevent cached residue from faking existence?

Slice 4 rule:

- an artifact exists only if canonical state says it exists
- no cached thumbnail, image map, preview, or prior package snapshot may create artifact presence after canonical state resolves
- workspace or workpiece changes invalidate prior artifact presence immediately until canonical artifact state for the new target resolves

Primary canonical seams to audit:

- `packages/tongs/src/workpiece-commit-api.ts`
- `apps/hearth/src/lib/hearth-image-map-repo.ts`
- `apps/hearth/src/lib/hearth-thumbnail-api.ts`
- `apps/hearth/src/routes/HearthShell.tsx`

Preferred implementation bias:

- prefer existing canonical read/query seams first
- add a new server-side seam only if current code cannot express artifact existence without local authority leaks
- if persistence or query semantics must change, stop and call out the DB/API change explicitly

### 2. Attachment

Question:

- How does Tongs confirm what a derived artifact belongs to, and how do we prevent remembered client pairing from becoming attachment truth?

Slice 4 rule:

- attachment is canonical only when the server-returned artifact relationship says so
- local mirror path hints, stale UI state, or remembered artifact selection may suggest context but may not decide attachment
- once canonical state resolves, any conflicting local attachment mapping must be cleared, replaced, or degraded explicitly

Planning questions to answer before coding:

1. Which derived artifact surfaces still infer attachment from prior client state instead of canonical returned relationship?
2. Do current image-map and thumbnail seams already return enough canonical attachment context to suppress stale client pairing?
3. Are any package-derived outputs still attached in UI by remembered workpiece/draft pairing rather than canonical readback?

### 3. Freshness

Question:

- How do we prevent stale previews, thumbnails, image maps, or metadata outputs from looking current?

Slice 4 rule:

- freshness/currentness must come from canonical recency, version, metadata timestamp, or package truth
- "most recently seen locally" must never be treated as current truth after canonical resolve
- late async artifact responses must not repaint older artifact state over newer canonical truth

Freshness questions to answer before coding:

1. Which surfaces currently treat the latest client-held artifact snapshot as current before or after canonical resolve?
2. Do any saves rely on local artifact timestamps rather than canonical metadata or returned server timestamps?
3. Can late async responses still overwrite fresher artifact state after workspace/workpiece change?

### 4. Intake Transition

Question:

- At exactly what point does a locally detected artifact stop being staged input and become canonical artifact state?

Slice 4 rule:

- mirror-detected artifacts remain staged input until Tongs canonicalizes and attaches them
- local detection or preview alone must not make the artifact current, attached, or fresh
- confirmation must come from the canonical artifact returned by Tongs, not from ongoing local presence

Transition questions to answer before coding:

1. Which current mirror-intake paths jump directly from local detection to assumed canonical artifact display?
2. Where must the UI show staged/uploading state instead of current artifact truth?
3. Do any current import paths silently overwrite or refresh canonical artifacts based on local file presence alone?

## Backend Decisions

Primary files:

- `packages/tongs/src/workpiece-commit-api.ts`
- any concrete artifact repo/API surface currently used by Hearth

Expected backend posture:

- canonical artifact reads return the present-tense truth for existence, attachment, and currentness
- current artifact readbacks include enough identity and attachment information to suppress stale local pairing
- mirror-intake confirmation returns canonical artifact identity before the UI treats the artifact as current truth

Preferred first implementation:

- use current artifact read/write seams if they already express canonical truth cleanly
- only expand DTOs or route behavior if presence, attachment, or freshness cannot be expressed without local authority leaks

## Hearth UI Decisions

Primary files:

- `apps/hearth/src/routes/HearthShell.tsx`
- artifact-specific client modules under `apps/hearth/src/lib/`

Slice 4 UI rule:

- Hearth may show loading or explicitly transient preview state
- Hearth must replace that state with canonical artifact truth as soon as canonical state resolves

Required UI outcomes:

- no cached artifact material still yields correct canonical artifact presence/attachment/freshness
- workspace/workpiece change clears or ignores stale artifact residue immediately
- stale local previews do not remain visible as if they were current canonical artifacts
- canonical readback after save or import replaces any prior client residue decisively

## Intake Decisions

Primary sources:

- `LOCAL_MIRROR_INGEST_STATE_MACHINE.md`
- any current mirror-detection/import code paths in Tongs or Hearth

Slice 4 intake rule:

- detect and stage may feel immediate
- canonicalize and attach decide truth
- confirm is the first point where the UI may treat the artifact as real, attached, and current

Preferred first implementation:

- preserve fast detect/stage UX
- add explicit staged/uploading or confirming states where needed
- prevent local mirror presence from behaving as silent refresh or replace once canonical identity exists

## Verification Plan

### Tongs / Artifact Seams

- targeted regressions prove canonical artifact reads determine presence, not cached residue
- targeted regressions prove attachment comes from canonical relationship, not inferred client pairing
- targeted regressions prove canonical freshness wins over older local/client snapshots
- targeted regressions prove intake confirmation returns canonical identity before current-artifact truth is shown

### Hearth

- confidence tests prove derived artifacts resolve correctly with no cached artifact material
- confidence tests prove workspace/workpiece change clears or ignores stale artifact residue
- confidence tests prove late async artifact responses cannot overwrite newer truth
- confidence tests prove second client converges on the same artifact state from SSOT alone
- confidence tests prove staged/local intake does not become current artifact truth before canonical confirmation

### Wrapper / Smoke

- run `pnpm --filter nursery typecheck`
- run affected Hearth confidence/regression suites
- run targeted artifact/Tongs regression suites
- run `pnpm smoke:core`

## Implementation Order

1. audit current artifact read/write/import seams for any local authority on presence, attachment, freshness, or intake transition
2. patch Tongs artifact seams only where current canonical responses are insufficient to express truth cleanly
3. patch Hearth artifact display logic so canonical artifact state replaces stale local residue decisively
4. patch mirror-intake transitions so staged input remains staged until canonical confirmation
5. add targeted regressions and confidence proofs
6. verify package and smoke paths
7. write `LOCAL_MIRROR_SSOT_SLICE_4_COMPLETION.md`

## Exit Criteria

Slice 4 is complete when all of the following are true:

- derived artifacts can resolve correctly with no cached artifact material
- stale artifact residue is cleared or ignored on workspace/workpiece change
- artifact attachment is canonical, not remembered
- artifact freshness/currentness is canonical, not "last seen locally"
- local previews remain explicitly transient and are overwritten cleanly on canonical resolve
- mirror-intake artifacts do not become current truth before canonical confirmation
- second client converges on the same artifact state
- a completion note records what shipped, how it was verified, and any wrapper caveats honestly

Slice 4 meets these criteria.
