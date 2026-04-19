# Hammer Reopen / Preview / History Audit

Date: 2026-04-19

## Scope

This audit closes the remaining trace items around:

- reopen hydration and fallback behavior
- timeline / preview truth flow
- history persistence and replay handoff

It reflects the code after the transitional structured-transcript reopen fallback was added.

## Findings

### 1. Canonical reopen is still gated by editorial authority

Hammer canonical reopen prefers persisted composition only when `editorial_authority` is present and usable.

Verified behavior:

- canonical autosave builds and sends `editorial_authority` in the Hammer persistence save request
- reopen hydration can see persisted `structured_transcript`
- revision transcript may still be absent on reopen
- strict canonical hydration rejects persisted composition when `editorial_authority` is missing

Migration bridge now in place:

- if `editorial_authority` is missing but `structured_transcript` is valid, Hammer reopens from the persisted structured transcript
- this path is explicit and noisy: it emits a console warning and marks hydration as transitional rather than canonical
- raw bootstrap remains the final fallback only when neither canonical authority nor structured transcript fallback is usable

Implication:

- user work is no longer discarded back to raw when a usable persisted transcript exists
- the long-term target remains full canonical reopen from authority-backed persisted composition

### 2. Preview transport is derived from committed editor truth, not raw media alone

Hammer preview playback is explicitly derived from committed editor state.

Verified behavior:

- preview seeking recomputes from persisted / history-backed `audioEdit` cuts plus transcript segment state
- disabled transcript spans and audio cut regions both participate in preview playback resolution
- the preview transport contract requires edit approvals to commit into authority-backed editor state before the preview claims they applied

Implication:

- preview truth is downstream of committed transcript/audio state, not optimistic UI state
- if preview looks wrong after reopen, the right seam to inspect is hydrated editor state, not only media decode or player state

### 3. Visual timeline loads from persisted timeline first, with legacy placement migration still active

Hammer visual preview does not rebuild only from raw launch context.

Verified behavior:

- the editor loads `visualTimeline` from the persisted Hammer snapshot
- canonical `visual_timeline` is normalized first
- if canonical timeline is absent or incomplete, persisted legacy visual placements are migrated into a usable timeline state
- the migration path is instrumented with `[hammer:migration]` debug output including origin, asset count, clip count, and revision

Implication:

- visual preview and timeline dock are already persistence-backed
- however, the timeline seam is still in a migration period because legacy placement migration remains a valid load path

### 4. History replay is intentionally conservative and blocks on base mismatch

Hammer history is a separate persistent lineage artifact, not a silent extension of the main Hammer state snapshot.

Verified behavior:

- the shell computes a `baseRevisionId` by hashing the current baseline editor state
- it loads either revision-scoped history or workpiece-scoped history depending on whether a revision id is active
- if the loaded history ledger base does not match the current baseline hash, replay is blocked and Hammer opens baseline without replay
- snapshot recovery is optional acceleration only; if snapshot manifest or payload is missing or invalid, Hammer degrades to full ledger replay with an explicit status message
- when history is saved at workpiece scope, Hammer also writes a presence sentinel so future opens can distinguish fresh state from unexpectedly missing history

Implication:

- history handoff is safe by default: mismatch produces an explicit recovery status instead of silent corruption
- history remains a separate persistence seam that can fail independently from the main Hammer state snapshot

## Current Posture

### Stable

- autosave sends canonical authority intent
- preview transport derives from committed editor truth
- visual timeline persistence is live and hydrated into the shell
- history replay is guarded by baseline hashing and explicit recovery messaging
- transitional structured-transcript reopen fallback now preserves user work during migration gaps

### Still Transitional

- full canonical reopen still depends on reliable persisted `editorial_authority`
- visual timeline hydration still supports legacy placement migration
- transcript reopen purity is not yet raw-base replay from authority alone

## Residual Risks

1. If `editorial_authority` fails to persist or load, Hammer will reopen in transitional transcript mode instead of canonical mode. This preserves work but should be treated as migration debt, not final architecture.
2. Visual timeline truth can still originate from migrated legacy placements when canonical timeline data is missing, so timeline persistence is more mature than before but not fully legacy-free.
3. History lineage can still be absent or mismatched independently of the main snapshot; the system is honest about this, but the user experience still depends on those artifacts remaining healthy.

## Recommended Next Check

Run one authenticated live reopen against a real workpiece and confirm the browser emits either:

- canonical reopen from persisted authority, or
- explicit transitional reopen warning from structured transcript fallback

The expected outcome is that raw bootstrap should no longer win when persisted structured transcript state is valid.