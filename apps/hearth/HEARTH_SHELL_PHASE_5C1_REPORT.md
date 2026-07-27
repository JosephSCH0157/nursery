# HearthShell Refactor Phase 5C1

## Baseline

- Branch: `codex/hearthshell-refactor`
- Commit: `9b226bd72e390dac77e12f1e190655821fed0362`
- Worktree: clean
- HearthShell: 6,869 lines, 116 imports, 268 direct hooks
- Expanded hooks: 347
- Expanded SHA-256:
  `43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448`
- Bundle: 8 chunks, 1,516,357 bytes total, 769,094-byte largest chunk
- B-roll lazy chunk: 16,070 bytes

## Existing data and authority path

The existing path remains shared Episode Package → canonical `broll_plan`
projection → creator-local B-roll draft workspace → guarded core/bridge hooks
→ `persistBrollPlan` → Tongs-backed asset upload/ingestion → refreshed package
projection. The controller composes those existing hooks and never imports a
repository. Tongs therefore remains the sole canonical persistence, identity,
revision, and recovery authority.

Hearth continues to own editorial prompts, moment curation, and placement
hints. Hammer still owns executable timeline placement. Quench still owns
release and publishing.

## Extracted boundary

`useHearthBrollController.ts` is the typed façade for B-roll workspace state,
core commands, bridge commands, status/progress/completion projection, retry,
and lazy-surface contract assembly. Hook call sites retain their exact order.

Pure modules own:

- immutable eligibility reasons from Phase 5B plus applied/stale plan state;
- canonical beat progress and fail-closed completion;
- creator data-visual draft projection;
- honest canonical preview-path preference.

HearthShell no longer imports B-roll workspace/core/bridge hooks or its prop
builder directly. The existing operation-authority guards still scope
generation, upload, ingestion, selection, retry, and persistence, so late
identity-A operations cannot update identity B.

## Image-planning boundary

The controller consumes `imagePlanningController.brollEligibilityInput`
directly. It does not read image-map repositories or reconstruct eligibility
from local arrays. Inactive identity, unavailable/incomplete image planning,
unapplied Visual Plan, stale planning, count mismatch, missing selections, and
blocking unresolved anchors retain explicit reasons. Eligibility remains
distinct from generation, selection, completion, placement, and release.

## Commands, preview, and completion

Generation, upload, ingestion, selection, conflict/retry, provider behavior,
AI confirmation/credits, canonical membership, provenance, and recovery still
run through the unchanged existing hooks. They do not mutate Visual Plan or
image-map authority and do not create Hammer placements or release state.

Completion requires a loaded eligible projection with at least one canonical
beat and every beat both selected and resolved. Inactive, blocked, failed,
empty, partial, stale, preview-only, and local-only states cannot complete.
Preview failure remains non-destructive and cannot substitute a raw video path
for preview evidence.

## Preserved boundaries

The shared `useEpisodePackageLoader` remains the single owner in HearthShell.
Reference Clips remain on their separate workspace, actions, repository path,
and prop builder. Thumbnail, Visual Plan, Episode Images, Metadata, release,
publishing, schemas, migrations, RPCs, queries, and RLS were not changed.

## Metrics and hook proof

- Direct hooks: 268 → 268
- Expanded hooks: 347 → 347
- Expanded SHA-256 before/after:
  `43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448`
- HearthShell lines: 6,869 → 6,875
- Direct import declarations: 116 → 114

## Bundle

- Chunks: 8 → 8
- Total: 1,516,357 → 1,518,583 bytes (+2,226)
- Largest eager chunk: 769,094 → 771,320 bytes (+2,226)
- Visual Plan: 15,320 → 15,320 bytes
- Episode Images: 32,420 → 32,420 bytes
- Thumbnail: 73,190 → 73,190 bytes
- B-roll: 16,070 → 16,070 bytes
- Reference Clips: 17,230 → 17,230 bytes
- Metadata: 8,620 → 8,620 bytes

Only lightweight contracts and pure projections entered the eager graph. All
six production surfaces remain lazy and thresholds are unchanged.

## Validation

- Focused Phase 5C1 tests: 6/6
- Hearth typecheck: passed
- Hearth tests: 96 files passed
- Tongs commit API: 135/135
- Nursery build: passed
- Hearth bundle verifier: passed
- `git diff --check`: passed
- `forge-nav.json`: restored

## Recommended Phase 5C2

Extract Reference Clips alone: its workspace, prompt/source bridge, canonical
asset upload/generation/selection, preview evidence, completion, and existing
lazy surface contract. Keep B-roll as an immutable upstream input, retain the
shared Episode Package loader, and exclude Metadata, release, Quench, and
Hammer placement.

Phase 5C1 remains uncommitted for review.
