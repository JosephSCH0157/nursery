# HearthShell Refactor Phase 5A Report

## 1. Baseline

Branch `codex/hearthshell-refactor`, commit
`9f51f8e5da4b20ddc1cb5d06e8b9d8a0b72f558e`, clean and synchronized.

## 2. Previous data and import path

HearthShell directly composed thumbnail workspace state, Episode Package
thumbnail projection, canonical v3 and candidate-authority reads, preview
loading, concept/generation/upload actions, brand-template loading, logo
preview, draft synchronization, and the lazy panel prop bag.

## 3. Responsibilities extracted

The Phase 5A controller owns thumbnail-local state, canonical progress,
identity-scoped canonical reads, concept/generation/upload command
composition, preview lifecycle, brand lifecycle, completion/load
presentation, and lazy-surface assembly.

## 4. Boundaries

- `useHearthThumbnailController.ts`: typed route-level owner and ordered hook
  fragments.
- `hearth-thumbnail-contracts.ts`: state/commands/status/surface contract.
- `buildHearthThumbnailViewModel.ts`: pure load and completion derivation.
- `hearth-thumbnail-preview.ts`: pure canonical preview-path preference.

## 5. Shell removals

HearthShell no longer imports the thumbnail workspace, preview, concept, or
generation hooks; canonical thumbnail repositories; brand loading/preview
repositories; or the thumbnail panel prop builder. It consumes only the
Phase 5A controller module.

## 6. Shared Episode Package decision

`useEpisodePackageLoader` remains at its existing shared production owner
because its immutable package feeds Visual Plan, Images, B-roll, reference
clips, thumbnails, and metadata. Phase 5A accepts the thumbnail projection
and uses the existing shared refresh command; it creates no second package
loader.

## 7. Candidate-set authority

All candidate and set revision creation, ordered membership, expected
revision, replay receipts, stable identities, hashes, and eligibility remain
inside the existing Tongs APIs. The controller projects returned canonical
rows and does not locally reconstruct or persist a candidate set.

## 8. Commands

Existing concept, generation, regeneration, upload, selection, primary
selection, and retry hooks are composed unchanged. Their operation-authority
tokens, AI-credit confirmation, canonical persistence calls, replay/conflict
handling, and no-auto-selection behavior remain intact.

## 9. Preview paths

The pure resolver prefers the candidate's canonical Tongs asset path and only
falls back to the matching canonical composite path. Missing paths remain
unavailable; preview failure neither removes nor selects a candidate.

## 10. Brand and eligibility

Existing default/pinned templates, canonical logo provenance, historical
brand states, explicit approval/revocation, locked eligibility names,
readability, and distinction evidence remain in their existing Tongs-backed
implementation. No pixel inference or implicit historical approval was
introduced.

## 11. Completion

The pure completion projection requires a non-empty canonical set whose
members are all canonically eligible. Empty, partial, failed, unavailable, or
preview-only state cannot become complete.

## 12. Approved-script invalidation

Approved-script identity and invalidation remain at the Phase 4A/shared
Episode Package boundary. Phase 5A neither selects scripts nor changes the
existing thumbnail staleness contract.

## 13. Identity and stale operations

Canonical reads capture workspace/workpiece identity, cancel on cleanup, and
recheck both identities before committing. Existing generation, upload,
selection, preview, and brand commands retain their operation/request
generation guards, so identity A cannot update identity B.

## 14. Other production ownership

Visual Plan, Episode Images/image map, B-roll, reference clips, metadata,
release, publishing, and recording were not extracted or changed.

## 15. Direct hooks

Direct HearthShell hooks/custom hooks: `275 → 268`. The seven-site reduction
comes from expanding the canonical projection and six thumbnail lifecycle
effects behind ordered Phase 5A fragments.

## 16. Expanded hook proof

Expanded sequence: `347 → 347`.

SHA-256 before and after:
`43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448`.

The controller fragments expand to the original workspace hooks, canonical
`useState/useCallback/useEffect`, preview hooks, command callbacks, and six
lifecycle effects in their original positions.

## 17. HearthShell metrics

- Lines: `7,026 → 6,840` (`-186`)
- Imports: `136 → 131` (`-5`)

## 18. Bundle

- Verifier chunks: `8 → 8`
- Total: `1,509,387 → 1,513,623` bytes (`+4,236`)
- Largest: `762,124 → 766,360` bytes (`+4,236`)
- Thumbnail lazy chunk: `73,190 → 73,190` bytes

The eager increase is the lightweight typed controller and pure projections,
below the 10 KB investigation gate. Thumbnail remains lazy, and Visual Plan,
Episode Images, B-roll, Reference Clips, and Metadata remain separate lazy
chunks. Bundle thresholds are unchanged.

## 19. Validation

- Focused Phase 5A/authority/preview suite: 44/44 passed.
- Hearth typecheck: passed.
- Hearth tests: 94 files passed.
- Tongs commit API: 135/135 passed.
- Nursery production build: passed.
- Hearth bundle verification: passed.
- `git diff --check`: passed.

## 20. Files changed

- `apps/hearth/src/routes/HearthShell.tsx`
- `apps/hearth/src/routes/hearth-shell/useHearthThumbnailController.ts`
- `apps/hearth/src/routes/hearth-shell/hearth-thumbnail-contracts.ts`
- `apps/hearth/src/routes/hearth-shell/buildHearthThumbnailViewModel.ts`
- `apps/hearth/src/routes/hearth-shell/hearth-thumbnail-preview.ts`
- `apps/hearth/tests/hearth-shell-phase-5a-thumbnail-controller.test.ts`
- `apps/hearth/HEARTH_SHELL_PHASE_5A_REPORT.md`

## 21. Restored files

`apps/nursery/public/forge-nav.json` was restored after the build. No generated
assets, screenshots, caches, credentials, schema, migration, RPC, query, RLS,
or unrelated changes remain.

## 22. Recommended Phase 5B

Extract Visual Plan and Episode Images together only at their established
image-map boundary: shared approved-script projection, canonical map loading,
beat/placement commands, candidate generation/selection, preview evidence,
stale authority, and their two existing lazy surfaces. Exclude B-roll,
reference clips, metadata, and release.

## 23. Repository state

Phase 5A remains uncommitted on `codex/hearthshell-refactor` for review.
Nothing was pushed, merged, or deployed.
