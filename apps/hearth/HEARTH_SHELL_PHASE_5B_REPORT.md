# HearthShell Refactor Phase 5B

## Baseline

- Branch: `codex/hearthshell-refactor`
- Commit: `89ddfe0b985a7f54e7f6e62577e8f8910c9eaf4f`
- Worktree: clean
- HearthShell: 6,840 lines, 131 imports, 268 direct hooks
- Expanded hooks: 347
- Expanded SHA-256:
  `43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448`
- Bundle: 8 chunks, 1,513,623 bytes total, 766,360-byte largest chunk
- Visual Plan: 15,320 bytes; Episode Images: 32,420 bytes

## Boundary and authority audit

The existing path remains approved script authority → persisted Visual Plan
media map → canonical Tongs image-map revision → approved-script-relative
anchor verification → canonical candidates/selection → Hammer placement.
Hearth continues to own planning intent, Tongs remains the canonical
repository and concurrency authority, and no Hammer placement behavior moved.

The shared `useEpisodePackageLoader` remains in HearthShell because thumbnails,
Visual Plan, Episode Images, B-roll, reference clips, and metadata consume that
package. Phase 5B consumes its immutable projections and existing refresh
command; it does not create another loader.

`hearth-image-map-repo` and the Tongs image-map API remain the sole persistence
path. Compatibility projection is allowed only for an absent standalone
artifact while authority infrastructure is available. Typed canonical
authority unavailability remains a failure and is never projected as an empty
map. Historical maps may retain `provenance_unknown`; unavailable authority
cannot manufacture that state.

## Extracted boundary

`useHearthImagePlanningController.ts` is the single typed façade for the
existing ordered Visual Plan and Episode Images hook blocks. It owns their
surface assembly and exposes state, status, retry, progress, completion, and
an immutable B-roll eligibility input. It deliberately composes the existing
hooks and prop builders rather than replacing repositories or state machines.

Pure helpers separately own normalized progress, completion/degraded-state
derivation, and canonical preview-path preference. Completion fails closed for
inactive/loading/unavailable authority, zero planned images, count mismatch,
unresolved anchors, and missing canonical selections.

HearthShell no longer imports the two workspace hooks, action-hook modules,
preview lifecycle, canonical-script image-map hooks, or Visual Plan/Episode
Images prop builders directly. Hook calls were renamed through one façade at
their original call sites, preserving order and timing. The final prop bags are
built by the controller.

Generation/application, verification, exact/manual repair, candidate
generation/upload/selection, conflict refresh, replay, auto-advance, and
preview lifecycles still execute through their existing implementations.
Consequently their approved-script inputs, identity generations, stale
operation guards, AI confirmation/credit behavior, persistence semantics, and
operation ordering did not change.

## Boundaries preserved

Thumbnail ownership remains Phase 5A. B-roll receives no commands or mutable
state from Phase 5B. B-roll, reference clips, metadata, release, publishing,
recording, script approval, schema, migrations, RPCs, queries, and RLS were not
changed. Visual Plan and Episode Images remain separate dynamic imports, as do
the other four optional production surfaces.

## Hook and source metrics

- Direct hooks: 268 → 268
- Semantically expanded hooks: 347 → 347
- Expanded SHA-256 before/after:
  `43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448`
- HearthShell lines: 6,840 → 6,869
- Direct import declarations: 131 → 116

The line movement is surface input wiring for the new typed boundary; the
implementation modules and builders leave direct shell ownership.

## Bundle

- Chunks: 8 → 8
- Total: 1,513,623 → 1,516,357 bytes (+2,734)
- Largest eager chunk: 766,360 → 769,094 bytes (+2,734)
- Visual Plan: 15,320 → 15,320 bytes
- Episode Images: 32,420 → 32,420 bytes
- Thumbnail: 73,190 → 73,190 bytes
- B-roll: 16,070 → 16,070 bytes
- Reference Clips: 17,230 → 17,230 bytes
- Metadata: 8,620 → 8,620 bytes

Only the lightweight controller/contracts/pure projections entered the eager
graph. No heavy presentation dependency moved. Growth is below 15 KB and no
threshold changed.

## Validation

- Focused Phase 5B tests: 5/5
- Hearth typecheck: passed
- Hearth tests: 95 files passed
- Tongs commit API: 135/135 passed
- Nursery build: passed
- Hearth bundle verifier: passed
- `git diff --check`: passed
- `forge-nav.json`: restored

## Recommended Phase 5C

Extract only B-roll and reference-clip orchestration next, retaining the shared
Episode Package loader and consuming the immutable Phase 5B eligibility input.
Do not include metadata, release, publishing, or Hammer placement.

Phase 5B remains uncommitted for review.
