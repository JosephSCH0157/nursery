# Hearth Reality Snapshot

Status date: 2026-07-12
Baseline release: Forge `v1.2.0 Fire Burning` (`forge-v1.2.0`)

Purpose: separate Hearth reality into four buckets so implemented work, documented intent, verified behavior, and draft/open items stop getting mixed together.

## One-Line Reality

Hearth is a shipped editorial production app. `apps/hearth` is its only mounted implementation; `HEARTH_CANONICAL_AUTHORITY.md` records current executable authority and degraded states.

## What Hearth Is

Hearth is the Forge producer surface.

It owns:

- spark -> episode/workpiece shaping
- script and draft work
- editorial metadata
- thumbnail and image-map package prep
- ready-to-record curation
- downstream handoff preparation

It does not own:

- recording capture
- media editing
- publishing
- storage authority

Canonical sources:

- `apps/hearth/AGENTS.md`
- `apps/hearth/README.md`
- `apps/hearth/HEARTH_CANONICAL_AUTHORITY.md`
- `apps/hearth/HEARTH_V2_CONTRACT.md`

## Implemented In Code Now

Current repo code shows Hearth already has:

- A mounted app shell with explicit modes: `sparks`, `episodes`, `ready`, `series`, `focus`
- Focus editor tabs for `draft`, `planning`, `sources`, and `revisions`
- Sparks landing and forge flow into workpiece/episode context
- Ready-to-record queue UI with filtering, grouping, relabeling, remove/restore, and ordering
- `Open in Anvil` handoff with workspace/workpiece guard behavior
- AI conversation surface with proposal/apply flow
- Browser STT and AI STT lanes
- Script tag validation, deterministic formatting, and repair path
- Thumbnail concept/version tooling, generation, upload fallback, preview, and primary selection
- Image map CRUD, seed-from-script flow, and export flow
- Presence/team-mode foundations for shared workspace visibility
- Episode package V2 fields for SEO, thumbnail, and image map
- Session-planning storage/linkage foundations

Primary evidence:

- `apps/hearth/src/routes/HearthShell.tsx`
- `apps/hearth/src/lib/episode-package-v2.ts`
- `apps/hearth/src/lib/hearth-thumbnail-api.ts`
- `apps/hearth/src/lib/hearth-ready-scripts.ts`
- `apps/hearth/src/lib/hearth-presence.ts`
- `apps/hearth/src/lib/hearth-session-repo.ts`

## Verified

### Verified In This Workspace Session

The following passed on 2026-03-09:

- `pnpm --filter @nursery/hearth build`
- `pnpm --filter @nursery/hearth test:confidence`

Current confidence-test coverage includes:

- draft flag roundtrip
- revision cap behavior
- session roundtrip
- episode context build
- AI op apply/save-request behavior
- AI request payload episode binding
- Anvil tag validator and deterministic formatter

Primary evidence:

- `apps/hearth/package.json`
- `apps/hearth/tests/hearth-confidence.test.ts`

### Verified In Existing Repo Docs

Documented verification already recorded in the repo includes:

- V2 metadata persistence and reload behavior
- thumbnail generation/upload write paths and readback
- image-map export shape
- recording-session plus calendar `session_id` linkage roundtrip

Additional documented closeout reruns are marked complete for:

- `pnpm --filter @forge/tongs test:commit-api`
- `pnpm --filter @nursery/hearth build`
- `pnpm --filter teleprompter build:ts`
- `pnpm run gate`

Primary evidence:

- `apps/hearth/HEARTH_V2_CONTRACT.md`
- `PHASE_4_PLAN.md`

## Documented / Contracted

The repo already defines these as official Hearth contracts or baseline docs:

- V1 baseline manifest is frozen
- V2 artifact schema and authority boundaries are defined
- Phase 4 cross-tool contract exists for Hearth <-> Tongs, Hearth <-> Anvil, and Hearth <-> Bar-Stock
- VNext layout contract defines a two-region workspace with one main-surface mode at a time
- Team Mode v1 defines workspace scoping, attribution, presence, and soft-collision behavior

Primary sources:

- `apps/hearth/HEARTH_V1_MANIFEST.md`
- `apps/hearth/HEARTH_V2_CONTRACT.md`
- `PHASE_4_PLAN.md`
- `docs/hearth-vnext-layout.md`
- `docs/hearth-team-mode-v1.md`

## Still Draft / Still Open

These items are not cleanly closed in the documents:

- `docs/hearth-vnext-layout.md` is explicitly marked draft
- Phase 4 acceptance sections `4.1`, `4.2`, and `4.3` are still unchecked in the plan document
- Manual browser verification remains unchecked for:
  - Spark -> Forge in Hearth -> refresh -> same workpiece reopens
  - Hearth `Open in Anvil` loads expected script without paste fallback
  - Anvil Ready Scripts dropdown shows approved-unrecorded scripts in the active workspace
- Producer Gate + Learning has a QA procedure doc, but not a recorded pass result
- Team Mode is documented as rules/foundations, not as fully signed-off completion

## Practical Conclusion

Use these assumptions going forward:

- Hearth is implemented and usable now
- Hearth V2 package features are real, not speculative
- Cross-tool integration exists, but not all integration docs are formally closed
- Manual browser verification still needs explicit completion for some Phase 4 flows
- Layout and team-mode docs should be treated as active contracts, not as fully completed closure records

## Snapshot Summary

- Implemented: yes
- Shipped in release notes: yes
- Build/type confidence: yes
- Contract set complete and reconciled: yes for active authority; historical plans remain evidence only
- Manual cross-tool verification fully closed in docs: no
- Layout/status docs fully harmonized: no
