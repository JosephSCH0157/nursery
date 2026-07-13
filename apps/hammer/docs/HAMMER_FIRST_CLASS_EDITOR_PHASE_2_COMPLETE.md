# Hammer First-Class Editor — Phase 2 Complete

Completed: 2026-07-13.

## Canonical authority and precedence

`HammerCompositionV2` is the sole creative authority after its transaction is acknowledged on the recording revision. It contains source references, visual/audio/caption/graphic tracks, transcript corrections and range deletions, audio treatments, packaging, editorial-authority state, automated placements, and the canonical history head.

Existing projects enter an explicit `legacy_projection_pending` state. Their transcript, visual timeline, audio treatment, caption, packaging, placement, and editorial-authority slices are deterministically projected into one V2 candidate. They remain legacy-authoritative until Tongs acknowledges that candidate. Once an acknowledged V2 transaction exists, legacy slices are ignored; a corrupt or stale V2 transaction blocks rather than falling back and creating two live timelines.

Original media remains immutable and is referenced exclusively through Phase 1 provenance identity and fingerprints.

## One creative history transaction

Every V2 creative command produces one `HammerCompositionTransactionV2` containing both the resulting composition and its complete history. Composition and history are persisted in the same canonical artifact. Supported history includes transcript/media range deletion, split/trim, angle selection, audio processing, caption changes, graphics, transitions, packaging, editorial authority, and automated placements.

History starts with the untouched raw-source composition. Undo and redo move only the history head; repeated Undo returns the exact raw-source object without rewriting source media.

## Concurrency and acknowledgement

Migration `20260713043000_tongs_hammer_composition_v2_concurrency.sql` adds acknowledged composition revision, fingerprint, and history-head metadata to `tongs.recording_revisions`.

V2 saves require `expected_revision_updated_at`. Tongs validates transaction identity and history agreement, writes the immutable candidate artifact, then advances its canonical pointer and acknowledgement metadata with a compare-and-swap on the revision timestamp. A losing writer receives `composition_revision_conflict`; its unreferenced object cannot become canonical or acknowledge success.

The preflight query requires `composition_revision`, `composition_fingerprint`, and `composition_history_head_id` alongside the earlier V2 pointer columns. If the Phase 2 migration is absent, Tongs returns `hammer_v2_schema_unavailable` with HTTP 503 before writing the transaction artifact.

The new columns remain under existing recording-revision workspace viewer/editor RLS. No browser persistence participates in acknowledgement.

## Preview and render boundary

The render-plan compiler performs a runtime Composition V2 schema assertion and accepts no legacy timeline representation. Preview selects operations from that compiled plan. Thus preview and render share Composition V2 as their only creative input; operational provider expansion remains Phase 3.

## Permanent proof

Regression coverage includes deterministic projection, idempotence, unresolved-source refusal, single-authority selection, stale-V2 no-fallback behavior, save/reload acknowledgement, identity mismatch, optimistic conflict guards, all creative command categories, undo/redo, repeated Undo to raw state, and runtime render-plan schema rejection.

## Explicit deferrals

Roll/slip/slide, nested clips, and advanced track operations remain deferred. They must enter through `HammerCompositionCommand` and the same transaction/history boundary.
