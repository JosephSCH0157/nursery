# HE-8A Florida first immutable-head authorization package

Date: 2026-08-21

Baseline: `ca616a41c3500f70cc97d995fd8e199b532e060d`

Status: **not executable — ordering precondition failed**

Scope: offline analysis and local/in-memory rehearsal from the frozen HE-7 evidence only. No production request, Hammer mount, Florida write, or Anvil access occurred.

## Decision

The smallest defensible Florida edit is removal of the sole visual suggestion whose transcript anchor is unresolved. The real UI command does cross `historyAuthority.applyMutation()`, and a deterministic local rehearsal proves that its sequence-1 document reopens, undoes, and redoes correctly.

HE-8 must nevertheless remain blocked. The current UI launches immutable-head persistence and canonical component autosave as independent operations. There is no successful ordering that both binds the head to the post-edit component tuples and satisfies its revision-token CAS:

1. If the head wins, its authority read can bind the pre-edit timeline and placement registry tuples.
2. If the component autosave wins, `saveHammerRecordingRevision()` advances `recording_revisions.updated_at`; the installed epoch basis still supplies the pre-edit token, so the head returns `history_epoch_head_revision_token_conflict`.

The frozen proposal below is therefore a deterministic rehearsal vector, not authorization to edit Florida. A sequencing repair and a complete isolated UI lifecycle must pass before a production package can freeze an executable head request.

## Frozen evidence

- HE-7 snapshot: `D:\nursery\he7-retest-20260821\baseline.json`
- HE-7 snapshot SHA-256: `b4a26b9ceeeee2901b832507020277b9fba40571debf25680303346548e53384`
- Offline rehearsal: `D:\nursery\he8a-offline-20260821\rehearsal.json`
- Rehearsal SHA-256: `bcdc684a5c74d4a3b7d887fc7f6b74faac2c38a3d4b699fdf025979aac0f9257`
- Rehearsal program SHA-256: `b8595c8d98560ed1153894428d61a69644e50105d8ee367b0c58283d89e6d434`
- Determinism check: two independent executions produced the same rehearsal SHA-256.

The rehearsal file contains the complete pre-edit target object, canonical post-edit timeline and placement bytes, frozen history entry, and complete frozen head envelope. It is external because it contains reconstructed Florida artifact content.

## Durable UI mutation inventory

| UI action | Real semantic effect | Durable lanes | Suitability |
| --- | --- | --- | --- |
| Remove visual | Deletes one selected clip and its derived placement | visual timeline, visual placements, immutable history head | Preferred for the unresolved 0.3-confidence suggestion |
| Move by `-0.5s` / `+0.5s` or drag | Changes start/end timing | visual timeline, visual placements, immutable history head | Real edit, but does not resolve the uncertainty evidence |
| Resize/reposition or animation preset | Changes geometry or presentation | visual timeline, visual placements, immutable history head | Real edit, but unrelated to the anchor uncertainty |
| Transcript correction | Changes spoken-text projection and may trigger downstream alignment/remap | transcript and potentially dependent lanes, immutable history head | Broader than necessary and unsupported by the frozen evidence |
| Audio/cut operation | Changes audible/editorial timing | audio and potentially transcript/timeline dependents, immutable history head | Broader than necessary |

The removal handler at `apps/hammer/src/editor/useHammerWorkspaceShellVisualEditing.ts:420` calls the supplied history mutation authority with label `Remove image placement`, kind `visual_adjustment`, tool `video`, the exact affected segment and placement identities, and `immediatePersist: true`. Its reducer action is `DELETE_CLIP`; it removes the clip from its lane and clears only a matching selected-clip identity (`apps/hammer/src/visuals/state/hammerVisualReducer.ts:405`). The placements document is then derived from the canonical timeline, not edited independently.

## Placement inventory and selected correction

Florida has three uncertain placements in the frozen HE-7 visual-placement artifact:

| Placement | Anchor | Match state | Confidence | Flags |
| --- | --- | --- | ---: | --- |
| `placement_mm_from_media_still_broll-beat-f89a4ff5-04b5-408d-9cc9-83a7ad9a65a2` | `turn_102`, “Entire seasons lost.” | `unresolved` | 0.300 | `anchor_script_current`, `low_confidence_match`, `anchor_match_unresolved` |
| `placement_d5cf19d4-053c-4ca3-817d-a9055c442336` | `turn_125`/`turn_126`, “It’s happening in labs, greenhouses, and nurseries.” | `review_needed` | 0.657 | `anchor_script_current`, `low_confidence_match`, `anchor_match_uncertain` |
| `placement_mm_from_media_still_broll-beat-37cf912b-0010-4574-a274-79a0c24f8b56` | `turn_127`, “Researchers are developing greening-tolerant rootstocks.” | `review_needed` | 0.788 | `anchor_script_current`, `anchor_match_uncertain` |

Frozen target:

- placement ID: `placement_mm_from_media_still_broll-beat-f89a4ff5-04b5-408d-9cc9-83a7ad9a65a2`
- entry ID: `mm_from_media_still_broll-beat-f89a4ff5-04b5-408d-9cc9-83a7ad9a65a2`
- asset ID: `asset_10dd8c04`
- current interval: `380.456`–`383.206` seconds
- current clip/placement status: enabled, approved ingest, `uncertain`
- current semantic status: `anchor_supplied_resolution_failed`; transcript resolution `unresolved`
- proposed value: the clip is absent from the timeline and its derived placement is absent
- unaffected uncertainty records: the 0.657 and 0.788 review-needed placements remain unchanged

This is a genuine editorial correction: it rejects a specific unresolved visual suggestion. It does not alter transcript, audio, recording, authority graph, or either remaining review-needed placement.

## Deterministic rehearsal vector

The local vector freezes a diagnostic-only mutation time of `2026-08-21T16:00:00.000Z`, head time `2026-08-21T16:00:01.000Z`, and synthetic IDs beginning `8a000000-…`. These values must not be represented as production action times or identities.

| Value | Before | Frozen local result |
| --- | --- | --- |
| canonical editor-state hash | `hammer-state:5d6bc1c6` | `hammer-state:5eb73aaf` |
| timeline revision | 3 | 4 |
| timeline clips | 30 | 29 |
| placements | 30 | 29 |
| uncertain placements | 3 | 2 |
| timeline SHA-256 / bytes | `b25949c9346245e0f44cc7db2021db0f366edf284cf2b7869a2a4382dab460e3` / 81,728 | `49d54f35fd4c9a4b6dc1c3e4d648a13f67960e3ca2a68de04ae053d14b6dd1dc` / 79,616 |
| placements SHA-256 / bytes | `ec26a26fbc0be12e90581dad49b8d225c6d5e223cfa81a3da9a8375aac4eb4e6` / 66,394 | `1aaf4483de5e5783ce66d9353b98aa641f9047bd488fba3a8a96d9c82334c998` / 64,059 |

Frozen local sequence-1 head:

- head ID: `8a000000-0000-4000-8000-000000000001`
- path: `hammer/revisions/f642b5d9-cec2-4656-804e-49bb33bc0cb5/history/epochs/53e3a94f-9f2e-4bd7-85bb-bd311f81939d/heads/8a000000-0000-4000-8000-000000000001.history.v1.json`
- SHA-256: `5e658cabfae85bbc939920bdf35637da372603d43b485242b0cc1c3f7a4d294c`
- bytes: 166,169
- idempotency key: `hammer-head:8a000000-0000-4000-8000-000000000002`
- parent: the HE-6 sequence-zero epoch anchor, registry revision 1
- base: legacy `hammer-state:03c2c9fc`, discriminator `json-stringify-v0`, canonical base `hammer-state:5d6bc1c6`
- result: `hammer-state:5eb73aaf`, discriminator `canonical-json-v1`

The head passed strict envelope validation. The real command authority accepted exactly one `applyMutation()` call and scheduled exactly one history persistence call. Reopen produced `hammer-state:5eb73aaf`; undo returned exactly `hammer-state:5d6bc1c6`; redo returned exactly `hammer-state:5eb73aaf`.

## Intended write set and current impossibility

The semantic edit should require only:

1. canonical timeline bytes at the existing revision path, with registry revision `150 → 151`;
2. derived visual-placement bytes at the existing revision path, with registry revision `192 → 193`;
3. the recording-revision row token advancement associated with those two acknowledged artifact writes;
4. one immutable sequence-1 head Storage object and one registry row;
5. one `hammer_history_epoch_heads` row and one append-only transition row;
6. one CAS of `recording_revisions.history_path` from the epoch anchor to that head;
7. the existing Hammer workpiece-state acknowledgement row, because the current canonical-save coordinator invokes the state PUT even when the authority graph is unchanged.

Expected zero-write lanes are editor session artifact, transcript, audio, editorial-authority artifact/pointer, recording/media identity, epoch anchor, predecessor archive, packaging, snapshots, and the two untouched uncertain placements. The editorial-authority revision must remain 2.

The current code cannot safely realize the intended ordering:

- `historyAuthority.applyMutation()` calls `schedulePersist(true)` for this command (`apps/hammer/src/editor/hammerWorkspaceShellHistoryController.ts:207-226`).
- Immediate history persistence enqueues the head and resolves component registry authority before constructing the request (`apps/hammer/src/editor/hammerHistoryEpochPersistence.ts:121-131`).
- Only after the mutation handler returns does `requestDurablePersistBoundary()` signal React's canonical artifact autosave (`apps/hammer/src/editor/useHammerWorkspaceShellVisualEditing.ts:420-436`).
- The artifact save updates `recording_revisions.updated_at` unconditionally (`packages/tongs/src/workpiece-commit-api.ts:8610-8647`).
- The head request continues to use the revision token installed with the epoch basis (`apps/hammer/src/editor/hammerHistoryEpochPersistence.ts:103-107`).
- The production RPC rejects a differing token before its pointer CAS (`supabase/migrations/20260819140000_tongs_hammer_history_epoch_heads.sql:381-385`, `473-479`).
- The Tongs coordinator validates that every head component tuple equals the registry at head staging time (`packages/tongs/src/workpiece-commit-api.ts:8875-8880`).

Consequently, head-first can commit only against old component authority, while components-first invalidates the head's revision token. The existing focused tests prove isolated epoch serialization and isolated autosave behavior, but do not coordinate these two authorities from a single real UI mutation.

## Required stabilization gate before HE-8 authorization

A narrow repair must provide one ordered durable boundary for user mutations:

1. capture one frozen semantic mutation/document/state;
2. persist and read back only changed component artifacts;
3. refresh the epoch basis with the acknowledged revision token and exact post-edit registry tuples;
4. create exactly one immutable head using those tuples and CAS from the acknowledged parent;
5. retain the frozen plan across ambiguous outcomes and never create a head from pre-edit tuples;
6. surface a terminal conflict without silently leaving durable components and history pointing at different semantic states.

Required regression coverage:

- a real `Remove visual` UI command crosses `historyAuthority.applyMutation()` once;
- the component writes complete before the head authority is frozen;
- the sequence-1 head contains the exact post-edit timeline and placement tuples;
- the head uses the post-component-save microsecond revision token;
- no schedule produces a stale-component head;
- a stale token or component conflict leaves the epoch anchor selected and reports a terminal recoverable failure;
- ambiguous component and head outcomes resolve by readback without duplicate writes;
- reopen, undo, and redo reproduce the exact pre/post hashes;
- unaffected component registry revisions remain unchanged;
- mount and reopen remain zero-write.

After that repair passes the full isolated authenticated lifecycle, HE-8A must be regenerated from the then-current committed HEAD and frozen evidence. A separate authorization must name the exact production target, mutation, preconditions, and resulting write plan.

## Verification performed

- deterministic offline rehearsal: pass twice with identical SHA-256
- Hammer history epoch persistence tests: 5/5 pass
- Hammer workspace history tests: pass
- Hammer autosave commit-gap tests: pass
- Hammer typecheck: pass
- `git diff --check`: pass except the pre-existing line-ending notice for protected `apps/nursery/public/forge-nav.json`

No production endpoint was contacted. Florida was not mounted or changed. No head, artifact, pointer, registry row, revision token, session, or database row was created. `apps/nursery/public/forge-nav.json` remains protected and excluded.

HE-8 remains unstarted and unauthorized.
