# Hammer CP-11 Florida history-head mismatch diagnosis

## Decision

CP-11 classifies Florida's `history_current_head_mismatch` as **semantic history divergence with unrecoverable missing state evidence**, not stale base/head metadata alone. The persisted patches identify meaningful historical edits and remain useful forensic evidence, but neither the pre-recovery ledger nor the current ledger forms a cryptographically closed state chain. No replacement history bytes are proposed.

The safe disposition is to leave canonical history unavailable. Rewriting hashes, joining the two ledgers, installing an empty ledger, or synthesizing the missing state would change or invent undo/redo semantics. A repair may proceed only if an authoritative full editor-state snapshot for the missing boundaries is recovered and exact forward/inverse equivalence is proven offline.

This diagnosis used only existing CP-8/CP-9/CP-10 evidence, the frozen 2026-08-16 recovery bundle, one metadata-only production `tongs` dump, and one authenticated Storage GET of the already-advertised history path. Hammer was not mounted or opened. No session-open, writer, acknowledgement RPC, recovery action, autosave, pointer update, history installation, or database mutation was invoked.

## Scope and identities

- Production project: `wtvdjndyxegudufrompx`
- Repository HEAD: `93497ea8c2235e1e16b187ff43ddf615c6ba913a`
- Workspace: `494c2ae5-9037-4208-b898-fab4898ab430`
- Workpiece: `85d076d6-54e6-4b56-ab60-5eff4c87cdd0`
- Sealed recording: `6c5b0d00-f775-4611-ac67-284dd9ae7d39`
- Active revision: `f642b5d9-cec2-4656-804e-49bb33bc0cb5`
- Revision row token: `2026-08-19 11:11:01.882348+00`
- Authority tuple: canonical revision path, fingerprint `4a233d406b37abab0d9fb7ae708464aacc03cba6a188af96211669b6bde2a7bc`, authority revision `2`

The fresh production dump was compared to the CP-10 retest post-open dump for every row containing the Florida workpiece identity. The only changed row was the pre-existing browser presence heartbeat (`last_seen_at` advanced from `11:33:01.541+00` to `11:43:01.285+00`). All content, revision, pointer, registry, and event rows relevant to this diagnosis were unchanged. This task did not use or control the browser.

## Exact current history evidence

The fresh authenticated GET is byte-identical to the CP-10 baseline artifact:

| Property | Value |
| --- | --- |
| Path | `hammer/revisions/f642b5d9-cec2-4656-804e-49bb33bc0cb5/history.v1.json` |
| Bytes | `208379` |
| SHA-256 | `5fd59f66a0e5990553865ed06907337750dfdb82cf5504cd7306772527d43ccb` |
| Registry revision | `80` |
| Registry token | `2026-08-18 15:26:50.828229+00` |
| Document version | `1` |
| Session | `session_fc4374ab-0097-4c0f-abd5-5a0099940abf` |
| Declared base | `hammer-state:beaa7731` |
| Declared head | `entry:4bb8bdbc-1412-413d-ab90-d777b45d5ea9` |
| Entries / undo / redo | `3 / 3 / 0` |
| Checkpoints | `0` |

The active entries are:

| Entry | Parent | Declared base | Declared result | Semantic lanes |
| --- | --- | --- | --- | --- |
| `entry:96b65712-33ba-42c1-80ad-673613b469a2` | null | `hammer-state:6cc353db` | `hammer-state:f2b42a72` | transcript timing, selection/playhead, timeline, audio cuts |
| `entry:3ca9049d-9005-44a6-9e1e-28ccda664092` | first | `hammer-state:f2b42a72` | `hammer-state:6d571b24` | playhead and first manual audio cut |
| `entry:4bb8bdbc-1412-413d-ab90-d777b45d5ea9` | second | `hammer-state:6d571b24` | `hammer-state:1a4199fe` | second manual audio cut |

The last two hash edges close internally. The first does not start at the document's declared base: `beaa7731 != 6cc353db`. The declared terminal `1a4199fe` also predates later canonical projection changes and does not equal the current canonical editor-state hash. Thus changing only `baseRevisionId` or `headEntryId` cannot make this document valid.

## Historical `hammer-state:7cf64e31` reconstruction

The frozen server history from 2026-08-15 declares:

- document base `hammer-state:7cf64e31`;
- one entry `entry:33beba0f-d06b-461a-a9f6-b4d8890b7c33`;
- entry base `hammer-state:1149da3a` and result `hammer-state:c20c78b2`;
- forward replacement of the complete 30-asset/30-clip visual timeline (SHA-256 `36779b5c15475679354050e8a2aaf0f1cea89b3ea2159c2b60c9c5c65b212a1a`) and the identity-only authority graph;
- inverse replacement of a 29-asset/29-clip timeline (canonical JSON SHA-256 `06281d799059ac2337b8fa884ea93ee897bc2e118a6dbb74764c7723efbb3932`) and the prior authority graph.

This ledger was already discontinuous before recovery: `7cf64e31 != 1149da3a`. `hammer-state:*` is only a 32-bit FNV-1a digest of `JSON.stringify(editorState)`; it is not an addressable snapshot and cannot be inverted. The ledger has no checkpoint or snapshot reference containing the full state. Production events record that a history artifact was committed, but do not retain the overwritten bytes or the complete editor state for either hash.

The 2026-08-16 dry-run recovery appended `entry:6ba40e41-8e00-4fb1-9f70-224789f61a73`. It reasserts the 30-item timeline and placements in both forward and inverse directions. It intentionally has no base/result hashes. That proves the recovered visual payload, but it cannot supply the missing transcript, audio, studio-rack, output-selection, selected-segment, playhead, timing-hint, and exact authority state needed to reconstruct `7cf64e31` or bridge it to `1149da3a`.

Accordingly, the exact pre-recovery state represented by `7cf64e31` is not reconstructable from authoritative retained evidence. Its recoverable semantic subset is the 29-item inverse visual timeline plus prior authority graph; the remaining state fields are unknown.

## Deterministic replay result

The production verifier is deliberately fail-closed:

1. It hashes the supplied canonical head and compares it to the last entry's declared result.
2. It inverse-replays every active entry and requires the reconstructed state to hash to the document base.
3. It forward-replays every entry and requires exact equality with the supplied canonical head.

These checks live in `verifyHammerHistoryAgainstCanonicalHead()` in `hammerWorkspaceHistory.ts`. The current document fails the first check as `history_current_head_mismatch`; even bypassing that check would reach the independent declared-base discontinuity. The frozen pre-recovery document likewise cannot be replayed from `7cf64e31`, because its first entry requires `1149da3a`.

Patch-level replay establishes only the following:

- the recovered visual timeline and placements reproduce their frozen canonical bytes;
- the current ledger's second and third entries form a valid declared hash chain;
- the current transcript timings and audio-cut payload correspond field-for-field to the forward values in the current entries;
- inverse patches retain the pre-dead-air timings and prior audio-cut states;
- there is no deterministic state bridge from `7cf64e31` to `1149da3a`, from the recovered ledger to the current ledger, or from `beaa7731` to `6cc353db`.

Therefore “replay every entry from `7cf64e31`” cannot be completed without inventing missing fields. This is an evidence failure, not a replay implementation failure.

## Comparison with current canonical state

Current canonical artifacts remain:

- transcript: 137 segments, SHA-256 `005e41d5a16c4ed813324a50589243f8257dd664b04dc440d7b078d690c078ef`;
- timeline: v2/revision 3, 30 assets, 30 clips, one lane, SHA-256 `b25949c9346245e0f44cc7db2021db0f366edf284cf2b7869a2a4382dab460e3`;
- placements: 30 rows, SHA-256 `ec26a26fbc0be12e90581dad49b8d225c6d5e223cfa81a3da9a8375aac4eb4e6`;
- authority: revision 2 identity-only graph, SHA-256 `4a233d406b37abab0d9fb7ae708464aacc03cba6a188af96211669b6bde2a7bc`;
- audio: SHA-256 `1795e76c65badd8bd85eebb822cbb31bd3b5827c22c2c16f62adfacd5302a7b4`.

The current ledger describes the transcript timing and audio changes now present. Its timeline value is semantically the current 30-item timeline, but the persisted timeline later changed only `debug_origin` (`legacy_migration` to `canonical_load`) and `selected_clip_id` (Packaging Intro to null). Its authority graph later changed only `updated_at`. Those non-editorial projection changes are enough to alter the whole editor-state hash. They do not repair the older missing base boundaries.

No transcript text, segment identity, timeline asset/clip/lane content, placement decision, authority operation, approval, or recording/revision identity is shown to be lost. Conversely, the evidence cannot prove that the two historical ledgers collectively preserve every intended undo step, because the ledger between them was overwritten and no full-state checkpoint survives.

The three existing UI-reported uncertain placements remain untouched, as do all seven persisted diagnostic flag categories. Placement reconciliation is outside CP-11.

## Classification

- **Not stale metadata only:** both ledgers have document-base versus first-entry-base discontinuities, and the current terminal hash predates later canonical projection state.
- **Not merely a valid ledger whose head predates recovery:** the pre-recovery ledger was internally discontinuous before the recovery entry was appended.
- **Semantic divergence:** current canonical projection metadata differs from the state hashed by the current head, while meaningful current transcript/audio patches remain represented.
- **Unrecoverable missing evidence:** no retained full snapshot resolves `7cf64e31`, `1149da3a`, the recovered-to-current bridge, or `beaa7731` versus `6cc353db`.

## Safe repair boundary and non-proposal

There is no evidence-safe CP-12 write package at this time:

- replacement bytes: **not generated**;
- replacement SHA-256: **not available**;
- proposed registry transition: **none** (remain revision `80`);
- proposed history pointer/token transition: **none**;
- proposed revision-row transition: **none**;
- rollback artifact: the current exact 208,379 bytes are captured and hashed, but they are evidence only, not authorization to overwrite.

A future repair authorization must stop unless all of these preconditions are met:

1. Production still advertises the exact active revision, history path, registry revision `80`, registry token `2026-08-18 15:26:50.828229+00`, byte count, and SHA-256 above.
2. The authority tuple, transcript, timeline, placements, audio, and revision row token still match this report.
3. A trustworthy full editor-state snapshot is found for every missing hash boundary, including `7cf64e31` and the base of the current ledger, or the product owner separately approves discarding historical undo semantics.
4. Offline inverse replay reaches the declared base at every entry; forward replay reaches every declared result and the exact current canonical head.
5. Undo then redo for every active entry is byte/field identical for transcript, timeline, placements, audio, authority graph, and selection state.
6. The candidate preserves the three placement uncertainty cases and does not invoke placement reconciliation.
7. The candidate is installed and reopened in a disposable projection with no fallback, synthesis, autosave, or unrelated artifact change.

If exact snapshots remain unavailable, the acceptance check is that Hammer continues to reject the ledger with `history_current_head_mismatch` while canonical content remains usable. That is safer than fabricating a base hash or silently clearing history.

## Code path

- `hammerWorkspaceHistory.ts`: `hashEditorState()` at line 364 and `verifyHammerHistoryAgainstCanonicalHead()` at line 391; head check at 419, inverse/base check at 440, forward/head check at 459.
- `hammerWorkspaceShellHistoryController.ts`: canonical baseline construction at line 512, baseline hash at 528, mismatch verification at 622-629, and fail-closed non-installation at 633.

## Evidence and controls

- CP-8: `D:\nursery\cp8-florida-dry-run-20260819-0530`
- CP-10 acceptance: `D:\nursery\cp10-florida-acceptance-20260819`
- CP-10 quiescence retest: `D:\nursery\cp10-retest-20260819-1128`
- Frozen recovery bundle: `C:\Users\Iam11\Documents\Forge Recovery Bundles\florida-oranges-2026-08-16T00-27-57-200Z`
- CP-11 external evidence: `D:\nursery\cp11-history-diagnosis-20260819`

The external CP-11 directory contains the read-only production dump, exact current history download, extracted Florida rows, and comparison material; it contains no committed credential. No production write occurred. No Florida or Anvil application endpoint was invoked. The protected `apps/nursery/public/forge-nav.json` modification was preserved and excluded.
