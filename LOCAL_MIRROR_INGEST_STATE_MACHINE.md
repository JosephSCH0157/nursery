# Local Mirror Ingest State Machine

Implementation reference only. Constitutional lifecycle semantics are defined in `FORGE_SPARK_TO_ANVIL_LIFECYCLE_CANON.md`. Mirror-authority policy is defined in `LOCAL_MIRROR_SSOT_BURNDOWN_LOCK.md`. Derived-artifact authority is constrained by `LOCAL_MIRROR_SSOT_SLICE_4_DERIVED_ARTIFACT_LOCK.md`.

Date locked: 2026-03-11

## Purpose

Define the narrow intake state machine that allows local mirror folders to introduce new user-supplied artifacts without letting local presence become artifact truth.

## Core Rule

- Mirror folders may introduce new artifacts for intake.
- Tongs/cloud state ratifies canonical identity, attachment, and history.
- Once canonical identity exists, truth derives from cloud state, not local presence.

## Ingest States

### 1. Detect

- A new local artifact is observed in a valid mirror intake surface.
- The file is not yet canonical truth.
- Detection alone does not establish identity, attachment, or freshness.

### 2. Stage

- The artifact is treated as an intake candidate awaiting canonical handling.
- The system may inspect filename, path, media type, or suggested context.
- Any apparent match to existing canonical artifacts must remain non-authoritative at this stage.

### 3. Canonicalize

- Tongs assigns canonical identity or classifies the intake as duplicate, replacement candidate, or conflict.
- Canonical identity starts here, not at file existence time.
- If canonicalization fails, the artifact remains unratified intake, not product truth.

### 4. Attach

- Tongs confirms the canonical relationship to a workpiece, draft, session, package, or other owning seam.
- Mirror path hints may inform attachment, but they do not decide it.
- Attachment is authoritative only after Tongs confirms it.

### 5. Confirm

- The UI reflects the canonicalized and attached artifact returned by Tongs.
- From this point onward, artifact truth comes from canonical cloud state.
- Local mirror presence becomes disposable cache or provenance evidence, not authority.

## Safe Outcomes

### New Artifact

- No canonical match exists.
- Tongs creates canonical identity and attaches it through the canonical seam.

### Possible Match To Existing Canon

- Tongs treats the local file as a candidate update, version, or replace action.
- The system must not silently overwrite canonical truth based on local presence alone.

### Exact Duplicate

- Tongs may deduplicate or link to the existing canonical artifact.
- Duplicate local presence must not create a second truth source.

## Forbidden Shortcuts

- Treating local file existence as canonical proof of artifact presence
- Treating folder path alone as canonical attachment proof
- Treating local mtime or "newer on disk" as canonical freshness
- Silently overwriting an existing canonical artifact because a local copy exists
- Reattaching an existing canonical artifact based only on stale local mapping

## UX Rule

- Mirror intake may feel immediate, but the UI must distinguish intake from canonical confirmation.
- Until confirmation, the product may show staged or uploading state, not canonical current truth.

## Implementation Bias

- Prefer explicit detect -> stage -> canonicalize -> attach -> confirm flows.
- Prefer canonical conflict handling over silent replacement.
- Prefer cloud-returned artifact identity and attachment over client inference.
