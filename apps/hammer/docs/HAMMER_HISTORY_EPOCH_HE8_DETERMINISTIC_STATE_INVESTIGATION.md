# HE-8 deterministic editor-state investigation

Date: 2026-08-23

Scope: offline HE-8/HE-8A evidence and local code/tests only

Production activity: none

## Decision

`hammer-state:8387e7e6` is a valid description of the state that Hammer actually committed, but its history entry accidentally absorbed UI state established before the removal command. The rehearsed `hammer-state:5eb73aaf` is not the uniquely correct post-removal state: its history projection retained the stale 30-placement compatibility document and used the rehearsal clock. Once the rehearsal projection is normalized to the same 29-placement canonical timeline and both runs use the same operation timestamp, its semantic state matches production.

The defect is the command-authority comparison boundary. `createHammerHistoryCommandAuthority().applyMutation()` computed a command from the current mounted state and then submitted the complete result to a controller whose durable basis was older. Any selection, playhead, or diagnostic change made between the durable basis and the command therefore appeared to be part of the command. The repair computes the live-before to live-after command patch, then applies only that patch to the frozen durable controller state.

The `canonical-json-v1` hash contract is unchanged. Existing committed heads, including the HE-8 head, retain their exact hashes and remain verifiable and hydratable. No persisted artifact is rewritten.

## Frozen evidence and reconstruction

The investigation used these already-captured packages without network access:

- HE-8 production atomic request and response under `C:\Users\Iam11\.codex\evidence\he8-standalone-staging-20260823-0755`.
- HE-8A rehearsal at `D:\nursery\he8a-offline-20260821\rehearsal.json`.
- Accepted sequence-zero state at `D:\nursery\he7a-canonical-base-diagnosis-20260820\reopen-state.json`.

Applying each frozen forward patch to the same `hammer-state:5d6bc1c6` base reproduced both declared hashes exactly:

| projection | selected segment | playhead | placements | timeline `updated_at` | hash |
| --- | --- | ---: | ---: | --- | --- |
| sequence-zero base | `turn_137` | 0 | 30 | `2026-08-15T23:04:47.172Z` | `hammer-state:5d6bc1c6` |
| production HE-8 | `turn_102` | 386.5 | 29 | `2026-08-23T08:00:32.638Z` | `hammer-state:8387e7e6` |
| HE-8A rehearsal as serialized | `turn_137` | 0 | 30 | `2026-08-21T16:00:00.000Z` | `hammer-state:5eb73aaf` |

The production and rehearsal post-edit timelines differ at exactly one JSON pointer: `/updated_at`. Their clip, lane, asset, timing, geometry, and authority values are otherwise byte-for-byte structurally equal. The production placements projection correctly contains 29 placements; the rehearsal history state retained the pre-edit 30-placement compatibility projection even though its independently serialized placement artifact contained 29.

Normalizing the rehearsal placements from its post-edit timeline changes its hash from `hammer-state:5eb73aaf` to `hammer-state:29ff10b5`. Replacing the production selection/playhead with the durable base values and using the rehearsal operation timestamp produces the same `hammer-state:29ff10b5`. Thus the editorial result is equivalent. The remaining timestamp difference is legitimate operation metadata already present in the canonical timeline contract, not random serialization or state loss.

The frozen patch sets explain the discrepancy:

- HE-8A forward/inverse paths: `/visualTimeline` only.
- Production forward paths: `/selectedSegmentId`, `/playheadSec`, `/visualTimeline`, `/visualPlacements`.
- Production inverse paths: the same fields in reverse order.
- `transcriptTimingHint` is unchanged (`null`) in both.

With production component values but the durable sequence-zero selection/playhead, the post-edit hash is `hammer-state:a37a3b78`. This is the state the corrected command boundary would have produced for the production operation timestamp. It is intentionally not used to reinterpret or replace the committed `hammer-state:8387e7e6` head.

## Authority trace

`HammerEditorStateSerializable` in `apps/hammer/src/editor/hammerWorkspaceHistory.ts` is the complete hashed state. It contains transcript, visual placements, visual timeline, audio edit, studio rack, editorial-authority graph, output selection, selected transcript segment, playhead, and transcript timing hint. Canonical serialization recursively sorts object keys and preserves arrays and JSON values; `hashEditorState()` hashes that whole value.

Active pass/tool, focus, viewport, timeline zoom/scroll, selected visual clip, and Tool Bay route are not fields of `HammerEditorStateSerializable` and cannot directly affect an editor-state hash. The active tool and selected transcript segment are copied separately into history-document metadata during persistence; this metadata changes head bytes but not `resultStateHash`. Packaging affects a hash only through its canonical timeline placement or output-selection values. Session-derived diagnostics affect a hash only if projected into one of the explicit serializable fields.

The mounted shell supplies `captureWorkspaceState()` and `syncVisualTimelineFromCompatibilityState()` to the history authority in `apps/hammer/src/editor/HammerWorkspaceShell.tsx`. Visual removal invokes `DELETE_CLIP` with one operation timestamp in `apps/hammer/src/editor/useHammerWorkspaceShellVisualEditing.ts`; the reducer removes the clip and updates canonical timeline metadata in `apps/hammer/src/visuals/state/hammerVisualReducer.ts`. Compatibility normalization derives the placements document from that timeline.

Before this repair, `apps/hammer/src/editor/hammerWorkspaceShellHistoryController.ts` compared that complete live result directly with `controller.getState()`. Selection of the HE-8 target had already moved the mounted transcript selection to `turn_102` and playhead to 386.5, while the epoch controller still held `turn_137` and 0. The removal did not cause those two changes, but `buildStatePatches()` observed them against the durable controller and serialized them into the head.

Head construction in `apps/hammer/src/editor/hammerHistoryEpochPersistence.ts` consumes the frozen history document and editor state. Consequently entry IDs, operation timestamps, head IDs, and idempotency identities remain intentional immutable operation evidence. Deterministic comparison means equivalent canonical bases, identical command input (including the frozen operation timestamp), and frozen operation identities produce identical state hashes and head bytes; unrelated pre-command UI state no longer changes either.

## Canonical-state decision

Selection and playhead cannot be removed from `canonical-json-v1`: existing valid histories explicitly patch, undo, replay, and verify them. Transcript commands also intentionally change them. Removing them globally or silently changing the meaning of the existing discriminator would invalidate committed heads.

They are undoable only when the command itself changes them. Selection/playhead changes completed before a different command are mounted UI state and must not be annexed by that later command. The same rule applies to `transcriptTimingHint`. The repaired delta boundary preserves both contracts without a new hash algorithm or envelope migration.

## Repair and regression boundary

The repair changes only `createHammerHistoryCommandAuthority().applyMutation()`:

1. Capture and normalize the live pre-command and post-command states.
2. Build the command patch between those two live states.
3. Apply that patch to the controller's frozen durable state.
4. Normalize the result and let the existing controller create, hash, coalesce, undo, redo, and persist the entry.

Tests prove that production-shaped selection/playhead/diagnostic drift does not enter an unrelated mutation; two equivalent durable bases produce identical patches and result hashes; and a command that actually changes playhead still records it. Existing strict verification tests continue to prove that committed v1 heads containing selection/playhead patches remain supported and fail closed when altered.

No changes were made to migrations, RPCs, Tongs, persisted envelopes, hash algorithms, hydration, storage, production data, or HE-9 behavior.
