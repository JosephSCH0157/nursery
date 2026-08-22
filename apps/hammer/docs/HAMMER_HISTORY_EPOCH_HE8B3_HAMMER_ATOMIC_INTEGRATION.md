# HE-8B3 Hammer atomic-history integration verification

Date: 2026-08-21

Baseline: `bd02d3f6d37a104f3925c3eb0c74c9187541c9e6`

Scope: local Hammer integration only; no deployment or remote access

## Result

Hammer now sends every durable post-epoch mutation through the HE-8B2 unified component-and-head coordinator. The installed epoch/head basis remains frozen until an exact committed or readback-verified result is returned. A terminal conflict leaves the local editor state and prior durable basis intact. Reload generation changes invalidate stale acknowledgements.

The integration suppresses the independent canonical snapshot writer after epoch authority is installed. It compares canonical component bytes, stages only changed lanes, and commits those lanes with the immutable head under the single database boundary established by `20260821120000` and completed by `20260821130000`. Neither migration changed in HE-8B3; their SHA-256 values remain:

- `20260821120000`: `685b94076bc0968a5a49aeb18708d3771d8c867f6def46e442c501226f0560af`
- `20260821130000`: `59843954956754578ceb57539be047a972b825fc6af6333eb0c346e6ba200fdf`

## Durable behavior

- A commit plan freezes the revision token, history pointer, parent sequence/path/hash/byte count/registry tuple, all component tuples, initiator, idempotency key, and operation fingerprint.
- Canonical bytes are projected for audio, editorial authority, transcript, visual placements, and visual timeline. Only byte-different lanes enter `component_changes`.
- The atomic response/readback must identify the exact head and operation fingerprint before the durable basis advances.
- Overlapping work is single-flight. Equivalent requests share the acknowledgement; newer distinct pending work is deterministically retained and runs from the acknowledged parent.
- A conflict stops queued work and preserves unsaved local state. An install/clear generation change rejects stale completion.
- The authenticated read boundary accepts only exact canonical or valid promoted atomic-staging authority. Route identity, registry hash/bytes/revision/token, bucket, and storage-key grammar are verified.
- Compatibility placement projections alone still do not create history. When a canonical timeline mutation also changes its derived placements, both patches are carried so undo and redo restore a coherent state.

## Isolated authenticated lifecycle

Disposable identity: `forge-he3-he8b3-lifecycle-final2`

Bindings: loopback only (`127.0.0.1:60321` API, `127.0.0.1:60322` database); tested LAN addresses refused connections. The existing `nursery` stack was unchanged.

The complete repository migration chain initialized successfully. Synthetic owner, viewer, and cross-workspace users authenticated through local Auth. Seven canonical fixture artifacts were generated locally and downloaded byte-for-byte through the real Tongs `read-file` transport. Owner/editor and viewer reads succeeded; anonymous and cross-workspace reads were denied.

Lifecycle result:

1. Divergent legacy history was archived and a sequence-zero epoch anchor committed.
2. Reordered timeline object keys reopened with the same canonical state hash.
3. One real unresolved visual was removed from the canonical timeline and derived placement projection.
4. Exactly `visual_timeline` and `visual_placements` advanced; audio, transcript, editorial authority, and editor-session registry authority did not advance.
5. The unified coordinator committed one sequence-one immutable head.
6. Reopen selected `epoch_head`; undo restored one placement and redo restored zero placements.
7. Every request remained loopback-confined and contained no forbidden production, Florida, or Anvil identity.

The disposable containers, network, volumes, and `.he3a` working directory were removed after verification.

## Regression and repository gates

- Hammer focused atomic/history/reopen tests: pass, including changed-only plans, parent byte count, exact fingerprints, idempotency, ambiguous readback, conflict preservation, coalescing, reload invalidation, promoted authority, legacy dual-hash boundary, and mount/reopen zero-write behavior.
- Hammer full suite: `161/161` pass.
- Tongs full suite: `386/386` pass.
- Hammer and Tongs typechecks: pass.
- Hammer lint: 0 errors; 78 warnings against the 84-warning grandfathered ceiling. Tongs lint: 0 errors/warnings.
- Type-safety ratchet: critical `any` 0, critical suppressions 0, total `any` 443/457, suppressions 1/1.
- Hammer architecture ratchet and Anvil cycle gate: pass; 272 files and zero cycles.
- Browser/workspace inventory: 11 active packages; registered browser inventory passes.
- Epoch/head migration contracts: 15/15 pass.
- Disposable database verifiers: epoch, epoch-head (including undo/redo sequences), and atomic authorization/CAS/idempotency/rollback/readback/direct-denial all pass.
- Production Hammer build: 366 modules; entry 215,999/225,000 bytes, total JS 262,554/275,000 bytes, gzip 86,687/90,000 bytes.
- `git diff --check`: pass (line-ending notices only).

## Security review

The TypeScript/Express security review found no new credential handling, arbitrary host selection, HTML/code execution sink, or direct database/storage mutation path in Hammer. Requests use the existing authenticated relative Tongs transport. Workspace, workpiece, recording, revision, component lane, canonical/promoted path, hashes, byte counts, registry revisions, lossless timestamp tokens, and response identities are validated fail-closed. Ambiguous outcomes are resolved only by the designated Tongs readback authority; Hammer does not reconstruct authority from direct tables or perform compensation. Tongs retains operation-owned, reference-aware cleanup authority.

## Protected worktree boundary

The following pre-existing modified files remained byte-identical and were excluded from this change:

- `apps/hammer/HAMMER_QUENCH_HANDOFF_SPEC.md` — `bfd2448bd60cf25a8960e53af396f68d936d780ca47b7b9441e0e3dc023bab93`
- `apps/quench/QUENCH_TECHNICAL_ARCHITECTURE.md` — `e4bcc45545fd9589731586d3b7b8edc948a03b7a4a4fb59b1b4c88aaacc418a7`
- `apps/quench/README.md` — `d43e5d5f023a42447107beb383108c4405ed20be3b7c446b2b35bae59a1c51c0`
- `docs/QUENCH_MANIFEST.md` — `f426808497c7d04a36f39ba4f331672aad83918d3ec84e89556add1279e35c15`
- `apps/nursery/public/forge-nav.json` — `e25a95808b9b5f7ae7eb0359360b9bda70e88a360db54b184e561f55626538ba`

No production endpoint, Florida or Anvil identity, remote credential, migration deployment, HE-8 execution, or HE-9 action was used or authorized.
