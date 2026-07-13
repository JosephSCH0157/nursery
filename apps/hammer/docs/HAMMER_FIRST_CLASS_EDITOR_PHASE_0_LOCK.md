# Hammer First-Class Editor: Phase 0 Lock and Foundation Tranche A

Recorded: 2026-07-13. This record separates the approved read-only Phase 0 from the later-phase foundations implemented in the same uncommitted tranche.

## Phase 0 — complete

Phase 0 inventoried current Hammer/Tongs/Quench storage, media, timeline, history, preview, render, caption, and handoff behavior. It established this precedence chain:

| Concern | Canonical owner | Existing reality | Locked target |
| --- | --- | --- | --- |
| Recorded source | Tongs canonical recording / Anvil kept-take receipt | Canonical recording plus immutable media signature | Fingerprinted provenance; editing never changes source identity |
| Creative state | Hammer revision persisted by Tongs | Split editor, transcript, visual, audio, and authority artifacts | One revision-scoped Composition V2 and one history precedence chain |
| Preview | Hammer | Multiple legacy models assemble current state | Render Plan V1 is the shared semantic contract |
| Creative render | Hammer | Render assembly and FFmpeg planning exist | Revision/fingerprint-bound jobs and creative masters |
| Publish/delivery | Quench | Receiver validates Hammer packet and resolves assets | Quench retains destination encoding, scheduling, upload, RSS, and receipts |

Frozen representative fixtures cover solo, interview, panel, missing media/relink, continuous intro/program/outro packaging, full treatment, and a stale render result.

## Foundation tranche A — implemented

This tranche intentionally advanced beyond read-only Phase 0:

- Phase 1 foundation: `HammerMediaProvenance`, fingerprint-validated relink, and disposable derived-artifact rules.
- Phase 2 foundation: versioned `HammerCompositionV2`, one command history, immutable raw base, and repeated Undo to raw state.
- Phase 3 foundation: deterministic `HammerRenderPlanV1` and plan-driven preview operation selection.
- Phase 9 foundation: revision/source/plan/profile-bound render jobs, stale completion, acknowledgement guard, and receiver-validated release packet.

These are canonical contracts and tested domain foundations. They do **not** claim that the current mounted legacy editor, every interactive preview provider, or the final encoder has been converted end to end. Operational preview/final-render parity remains later integration work; the shared semantic contract is established now.

## Schema and deployment gate

`recording_revisions` requires four new pointers: Composition V2, media provenance, render jobs, and release packet. Migration `20260713023000_tongs_hammer_composition_v2.sql` adds them under the existing viewer/editor recording-revision RLS boundary.

The Tongs save path probes those columns before writing any V2 artifact. If the migration is absent it returns `hammer_v2_schema_unavailable` with HTTP 503. It does not write partial V2 artifacts, acknowledge a legacy/browser fallback, or promote an alternate authority.

Legacy projects remain legacy-authoritative until deterministic projection succeeds and the resulting candidate is persisted and acknowledged by Tongs. Projection is idempotent, refuses unresolved source identity, returns an already-matching V2 authority unchanged, and refuses a competing identity. A failed projection cannot overwrite the existing representation.

## Authorization and identity boundary

All new pointers remain rows on `tongs.recording_revisions`; existing workspace viewer/editor policies therefore govern pointer reads and writes. The service additionally binds every save to workspace, workpiece, and revision before artifact writes. Quench receiver validation binds workspace, workpiece, recording revision, composition revision/fingerprint, source fingerprints, and the authorized artifact set. Cross-workspace packets, stale compositions, mismatched sources, and unauthorized artifact references are rejected.

## Explicit deferrals

The following are not completed by tranche A: mounted Composition V2 adoption throughout the editor, full preview/encoder consumption of all render-plan operations, advanced timeline tools, full multicamera behavior, final audio processors, source/program monitors, nested clips, deep collaboration, distributed rendering, custom shortcuts, performance optimization, and broad motion design.
