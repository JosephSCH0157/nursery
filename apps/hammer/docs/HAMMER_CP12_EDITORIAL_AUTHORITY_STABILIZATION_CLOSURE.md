# Hammer CP-12 editorial-authority stabilization closure

## Closure decision

Revision-owned editorial authority rollout checkpoints CP-0 through CP-10 are operationally complete. Production migration, the two-phase writer, strict reader hydration, idempotency, CAS conflict behavior, lossless timestamp tokens, canonical reopen, and mount-only reopen quiescence have all passed their authorized gates.

Florida Oranges is canonically openable with intact transcript, sealed recording, timeline, placements, and revision-owned authority. Its authority revision 2 is valid and canonical. No Florida rollback is required.

Florida's legacy history is a separately contained fail-closed condition. CP-11 proved semantic divergence and missing full-state checkpoints in both the historical and current ledgers. No safe historical reconstruction or replacement bytes exist. Hammer correctly refuses to install that ledger rather than inventing undo/redo state.

CP-12 is documentation and stabilization closure only. It performed no production access or mutation, database operation, artifact write, pointer change, Hammer open, session call, recovery action, history installation, or implementation change.

## Final production posture

The accepted production state remains the state established by CP-7 through CP-10:

- production project `wtvdjndyxegudufrompx` contains the reviewed additive authority schema and terminal-conflict RPC correction;
- the writer uses artifact write, registry metadata/hash, pointer CAS, and readback verification ordering;
- expected CAS loss returns a prompt non-retryable HTTP 409 without weakening authorization or integrity failures;
- PostgreSQL timestamp concurrency tokens retain their exact microsecond representation;
- independent identical persistence calls converge on the existing committed bytes without a second write or CAS;
- pointer-present missing, corrupt, unreadable, identity-mismatched, path-mismatched, or fingerprint-mismatched authority remains fail-closed;
- the reader hydrates revision-owned authority before selecting canonical persistence as the reopen source;
- a canonical mount is quiescent: hydration and compatibility/view projections do not dirty autosave, exact artifact bytes are skipped, and overlapping legitimate saves are single-flight;
- real semantic edits remain persistable and advance only their required lanes.

The CP-10 retest at commit `6a8ba65354c959f958ad49b5ad4e0cf5b9f74bca` proved canonical persistence reopen with zero artifact writes, zero authority writer/CAS calls, zero registry increments, and no pointer, fingerprint, authority-revision, revision-token, editor-session, or artifact-byte change.

## Florida canonical state

The accepted evidence fixes these identities and payloads:

- workspace: `494c2ae5-9037-4208-b898-fab4898ab430`;
- workpiece: `85d076d6-54e6-4b56-ab60-5eff4c87cdd0`;
- sealed canonical recording: `6c5b0d00-f775-4611-ac67-284dd9ae7d39`;
- active revision: `f642b5d9-cec2-4656-804e-49bb33bc0cb5`;
- transcript: 137 segments, SHA-256 `005e41d5a16c4ed813324a50589243f8257dd664b04dc440d7b078d690c078ef`;
- timeline: v2/revision 3, 30 assets, 30 clips, one lane, SHA-256 `b25949c9346245e0f44cc7db2021db0f366edf284cf2b7869a2a4382dab460e3`;
- placements: 30 rows, SHA-256 `ec26a26fbc0be12e90581dad49b8d225c6d5e223cfa81a3da9a8375aac4eb4e6`;
- authority path: `hammer/revisions/f642b5d9-cec2-4656-804e-49bb33bc0cb5/editorial-authority.v1.json`;
- authority fingerprint: `4a233d406b37abab0d9fb7ae708464aacc03cba6a188af96211669b6bde2a7bc`;
- authority revision: `2`.

Authority revision 2 was validated against the current persisted identities and canonical artifacts in an isolated in-memory projection. Its only difference from revision 1 was the CP-10 mount-generated authority `updated_at`; it contains the same identity-only authority graph and no semantic operation change. Revision 2 is therefore the established canonical authority, not corruption requiring restoration to CP-9 bytes.

No transcript content, recording authority, timeline asset/clip/lane content, placement decision, approval, history payload, or canonical identity was lost during the rollout. The three UI-reported placement uncertainty cases are unrelated to editorial-authority or history verification. They remain unchanged and were not reconciled.

## Legacy history disposition

The current history artifact remains immutable evidence:

- path `hammer/revisions/f642b5d9-cec2-4656-804e-49bb33bc0cb5/history.v1.json`;
- 208,379 bytes;
- SHA-256 `5fd59f66a0e5990553865ed06907337750dfdb82cf5504cd7306772527d43ccb`;
- registry revision 80;
- declared document base `hammer-state:beaa7731`;
- first active entry base `hammer-state:6cc353db`;
- terminal result `hammer-state:1a4199fe`.

The earlier retained ledger independently declares document base `hammer-state:7cf64e31` while its first entry requires `hammer-state:1149da3a`. Neither missing full editor state was checkpointed. The `hammer-state` token is a non-invertible 32-bit digest, and overwritten production history versions do not contain recoverable full-state snapshots.

Consequently:

- this is not a base/head metadata typo;
- the two ledgers cannot be joined by exact replay;
- changing hashes would manufacture evidence;
- replacing the ledger with an empty document would discard earlier undo semantics;
- no replacement byte sequence, SHA-256, registry transition, pointer transition, or revision-token transition is approved or available;
- `history_current_head_mismatch` and non-installation are the correct fail-closed behavior.

Canonical editing content remains readable independently of the unavailable historical undo ledger. No Florida rollback or history repair is required for closure.

## Explicit architectural deferral

A capability to “start a new history epoch from current canonical state” is deferred to a separate architectural task. CP-12 neither designs nor implements it.

Any future proposal must, at minimum:

1. preserve the divergent ledger bytes and registry evidence immutably;
2. clearly disclose that earlier undo history is unavailable;
3. require an explicit user command rather than mount, hydration, recovery, or autosave;
4. establish the current canonical state as a new, separately identified epoch without rewriting historical evidence;
5. define authorization, audit, rollback, and UI contracts before implementation.

Those requirements are boundary conditions only, not a design or authorization to create the capability.

## Rollout commit audit

The audited range is `4f4ee7c5^..3dffbcbf`, comprising 19 commits:

| Commit | Role |
| --- | --- |
| `4f4ee7c5` | revision reader/writer seam and CP-0–CP-4 verification |
| `61f103ab` | canonical session-conflict stabilization |
| `e1ab9fd0` | sealed canonical recording read model |
| `6527d491` | legacy v1 timeline reopen normalization |
| `8b48629f` | clean migration replay bridge |
| `6340b44d` | terminal PT409 authority conflicts |
| `cfc1364e` | committed-authority idempotency |
| `db3e3f28` | microsecond CAS token fidelity |
| `5013cdee` | defined absent-artifact transport handling |
| `de34e94a` | CP-5 isolated staging verification |
| `c2502e7a` | CP-6 production approval package |
| `0280d627` | CP-6 deployment and CP-7 metadata verification |
| `b7f00f2d` | intervening navigation timestamp commit, unrelated to authority semantics |
| `452e35a4` | CP-8 mutation-free Florida dry run |
| `eda3d60c` | CP-9 single-use Florida authority transaction receipt |
| `d2865c9d` | initial CP-10 acceptance and write-cascade evidence |
| `6a8ba653` | reopen-quiescence stabilization |
| `93497ea8` | successful CP-10 quiescence retest |
| `3dffbcbf` | CP-11 history divergence diagnosis |

The range includes the unrelated committed navigation timestamp because it lies chronologically between rollout checkpoints; it was not treated as authority implementation. The separate current `apps/nursery/public/forge-nav.json` worktree modification remains user-owned, excluded, and uncommitted.

The audit found no missing rollout checkpoint, unreviewed schema mutation, pointer-clearing behavior, history repair, placement reconciliation, or supersession workflow. The production receipts and Florida evidence remain mutually consistent.

## Final proportional gates

Run from HEAD `3dffbcbfb2e0b6e42121d6c8830d7bda087451ea` before this record:

| Gate | Result |
| --- | --- |
| Full Hammer suite | PASS, 158/158 test files registered and passed |
| Full Tongs suite | PASS, 315/315 tests |
| Hammer typecheck | PASS |
| Tongs/shared typecheck | PASS |
| Hammer architecture ratchet | PASS |
| Tongs lint | PASS |
| Hammer production build | PASS, 358 modules |
| JS entry budget | PASS, 215,999 / 225,000 bytes |
| Total JS budget | PASS, 262,554 / 275,000 bytes |
| Total gzip budget | PASS, 86,563 / 90,000 bytes |
| `git diff --check` | PASS; only the protected navigation file emitted the existing LF/CRLF warning |

Hammer scoped lint produced 1 error and 79 warnings. An isolated clean-worktree reproduction at CP-0 commit `4f4ee7c5` produced exactly the same 1 error and 79 warnings, including the same `jsx-a11y/media-has-caption` error in `HammerWorkspaceShellSourceBay.tsx`. The rollout introduced no lint debt.

The aggregate Hammer type-safety ratchet remains red on one pre-existing non-critical explicit `any` in `useHammerWorkspaceShellCleanupCandidateReview.ts`. At clean CP-0, the identical ratchet reported two unsafe files and one authority-critical escape; current authority-critical `any` and suppression counts are both zero, total explicit `any` is 444 against the 457 baseline, and suppressions remain 1. The rollout reduced this debt and introduced none. CP-12 does not expand into unrelated cleanup code.

## Final state

CP-0 through CP-12 are closed. Revision-owned editorial authority is operational in production, Florida's canonical authority revision 2 is valid, canonical reopen is quiescent, and the divergent legacy history remains safely unavailable. No further checkpoint, history epoch, recovery, rollback, or content mutation is authorized by this record.
