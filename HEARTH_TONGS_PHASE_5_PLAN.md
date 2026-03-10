# Hearth + Tongs Phase 5 Plan

Date: March 10, 2026  
Baseline: Hearth Phase 4 formally closed on `forge-v1.2.0`

## Purpose

Phase 5 turns Hearth from a corrected editorial surface into a production-prep surface, with Tongs as the canonical workpiece and asset spine.

The north star is simple:

- Hearth produces more than script text.
- Tongs knows more than files.
- Downstream tools consume structured workpiece outputs instead of rebuilding context from scratch.

Phase 5 is where Forge starts behaving like a production pipeline:

`Bar-Stock -> Hearth -> Tongs -> Anvil -> Hammer -> Quench`

## Scope

### In Scope

- Canonical workpiece asset metadata and query surfaces in Tongs
- Hearth-generated derived assets and metadata packages
- Image map / visual cue outputs tied to the active workpiece
- Hammer-prep and Quench-prep handoff artifacts generated from Hearth context
- Gate and API/browser proof for generated workpiece outputs

### Out Of Scope

- Media editing workflows inside Hammer
- Publish execution inside Quench
- Broad Hammer UI/runtime work
- Broad Quench runtime work
- Replacing the primary script contract or reworking Phase 4 navigation
- Replacing the existing AI lane model

## Canonical Concepts

These terms are locked before implementation:

- `workpiece`
  - The canonical episode container identified by `tongs.episodes.id`.

- `primary script`
  - The canonical Anvil-ready script file for a workpiece.
  - Current path authority remains `scripts/script.anvil.txt`.

- `workpiece asset`
  - A canonical generated or uploaded asset tied to a workpiece.
  - In Phase 5, this should extend the existing `tongs.assets` table, not introduce a second parallel asset registry.

- `derived asset`
  - A reproducible output generated from canonical workpiece inputs.
  - Examples: thumbnail prompt package, chapter markers, description draft, shorts ideas, image map export.

- `image map`
  - A structured set of visual anchors or cue entries attached to the workpiece package.
  - Current authority already exists in `forge.episode.package.v2`.

- `production package`
  - The structured editorial metadata bundle that downstream tools consume.
  - Phase 5 should evolve the existing episode package and related workpiece files instead of inventing a disconnected package type.

- `handoff artifact`
  - A specific canonical file or asset row produced for downstream consumption.
  - Examples: chapters JSON, description markdown, shorts JSON, visual cue map.

## Current Canonical Base

Phase 5 must build on the existing spine already present in the repo:

- Canonical workpiece file layout in [TONGS_PATH_CHARTER.md](/d:/nursery/nursery/TONGS_PATH_CHARTER.md)
- Existing canonical asset registry table in [20260228170000_tongs_assets_table.sql](/d:/nursery/nursery/supabase/migrations/20260228170000_tongs_assets_table.sql)
- Existing episode package contract in [episode-package-v2.ts](/d:/nursery/nursery/apps/hearth/src/lib/episode-package-v2.ts)
- Existing Tongs package parsing/writing in [workpiece-commit-api.ts](/d:/nursery/nursery/packages/tongs/src/workpiece-commit-api.ts)
- Existing Hearth reality and scope in [HEARTH_REALITY_SNAPSHOT.md](/d:/nursery/nursery/apps/hearth/HEARTH_REALITY_SNAPSHOT.md)

Phase 5 must not fork these into a separate asset or package system.

## Tongs Seam

Phase 5 implementation will require a DB migration / RLS update.

### Direction

Do not create a new `workpiece_assets` table unless the existing `tongs.assets` table proves structurally insufficient.

The preferred Phase 5 direction is:

1. Extend `tongs.assets` so workpiece assets can be queried by role and derivation.
2. Keep canonical file paths inside the workpiece tree.
3. Keep the asset row as the query/index surface and the file path as the content surface.

### Likely Schema Additions

Likely additions to `tongs.assets` or a tightly-coupled companion table:

- `asset_kind`
  - Examples: `thumbnail_image`, `thumbnail_prompt`, `image_map`, `chapters`, `description`, `shorts_ideas`, `transcript_segments`, `visual_cue_map`
- `source_tool`
  - `hearth | anvil | hammer | quench | user`
- `derivation_kind`
  - `generated | uploaded | imported | manual`
- `status`
  - `draft | ready | superseded | failed`
- `metadata_json`
  - structured asset-specific metadata
- `supersedes_asset_id`
  - optional lineage for replacement/supersession

If `metadata_json` lands, RLS and write policies must be updated in the same migration set.

### Likely API Surface

Tongs Phase 5 should expose:

- list workpiece assets by `workpiece_id`
- filter by `asset_kind`
- fetch current primary asset for a role
- register new generated asset rows atomically with file commits
- supersede older generated assets without deleting provenance

### Tongs Rule

Tongs remains the canonical authority for persisted asset metadata.

Hearth may generate candidate outputs, but persisted asset truth must live in Tongs-backed files plus Tongs-backed asset rows.

## Hearth Seam

Phase 5 makes Hearth production-aware without turning it into Hammer or Quench.

### Hearth Generates

Initial Phase 5 asset targets:

- thumbnail prompt packages
- chapter markers
- description drafts
- shorts ideas
- image map exports / visual cue maps
- Hammer-prep transcript segmentation and cue outputs

### Hearth Does Not Own

- final media editing
- publishing execution
- long-term asset authority outside Tongs

### Hearth Rule

Hearth-generated outputs must be:

- scoped to `workpiece_id`
- committed through canonical Tongs file paths
- queryable through Tongs asset metadata
- refresh-safe and multi-client safe

No Phase 5 feature may rely on local-only asset state as authority.

## Phase 5 Workpiece Outputs

These are the first likely canonical outputs:

- `assets/thumbnail-prompts/{id}.json`
- `assets/chapters/chapters.v1.json`
- `metadata/description.generated.md`
- `assets/shorts/ideas.v1.json`
- `assets/image-map/image-map.v1.json`
- `assets/hammer/visual-cues.v1.json`
- `assets/hammer/transcript-segments.v1.json`

These paths are directional, not final contracts yet. The implementation slice that introduces them must lock exact path names and event names.

## AI Lane Use

Phase 5 should use the existing Forge/BYO AI lane split intentionally, not redesign it.

Examples:

- script analysis -> Forge lane
- chapter generation -> Forge lane
- description draft -> Forge lane
- shorts ideas -> Forge lane
- thumbnail prompts -> Forge or BYO depending on spend posture

Token usage, credit application, and learning/profile writes remain server-side through the existing runtime model closed in Phase 4.

## Browser / API Proof Seam

Phase 5 completion should require proof at three levels:

### 1. API / Tongs proof

- canonical asset rows are created and queryable
- supersession behavior is deterministic
- workpiece scoping is preserved
- non-members are blocked by RLS

### 2. Hearth confidence proof

- generated package shapes are deterministic
- asset path contracts are stable
- image map and production package reads/writes roundtrip
- no local-only asset state becomes authoritative

### 3. Browser proof

- Hearth can generate a production-prep artifact for an active workpiece
- refresh restores generated output state from canonical storage
- downstream tool entry points consume the generated artifact in context

## Exit Criteria

Phase 5 is complete only when all of these are true:

- Tongs has a canonical query surface for workpiece assets and derived outputs.
- Hearth can generate at least one production-prep package beyond the primary script.
- Generated outputs survive refresh and second-client access.
- Image map / visual cue output is canonical and downstream-readable.
- Hammer/Quench-facing handoff artifacts exist as workpiece-scoped canonical outputs.
- API tests, Hearth confidence tests, and browser proof cover the new contract.
- No Phase 5 capability relies on local storage as persistence authority.

## Recommended Implementation Order

1. Lock the asset metadata extension in Tongs
2. Add Tongs query/write APIs for workpiece assets
3. Lock Hearth generated-asset contracts
4. Add image map and production package outputs
5. Add Hammer-prep / Quench-prep handoff artifacts
6. Add proof and gate coverage

## First Follow-On Planning Slice

Before implementation starts, lock these three items in the next artifact:

1. exact Tongs asset-model extension
2. exact first Hearth-generated asset set
3. exact proof/gate obligations for the first Phase 5 slice

Suggested mission name:

**Phase 5 - Workpiece Intelligence**
