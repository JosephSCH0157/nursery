# Hearth V2 Contract (Status + Artifact Schema)

Status date: 2026-02-28  
Baseline release: Forge `v1.2.0` (`forge-v1.2.0`)

This document records what Hearth V2 features are currently implemented in this repository.  
`HEARTH_V1_MANIFEST.md` remains frozen as the V1 baseline.
Current lifecycle terms, implementation ownership, degraded states, and Hammer/Quench handoffs are governed by `HEARTH_CANONICAL_AUTHORITY.md` and the lifecycle constitution.

## Included In V2

- Structured Episode metadata editing for:
  - `episode.seo` (titles/tags/descriptions)
  - `episode.thumbnail` (concepts, versions, primary selection)
  - `episode.image_map` (structured entries)
- Thumbnail pipeline:
  - concept-based generation
  - version history
  - primary version selection
  - generated image saved as Workspace/Tongs asset
  - upload fallback image path supported
- Image Map tooling:
  - structured entry create/edit/delete
  - deterministic seed-from-script flow
  - JSON export flow for downstream tooling
- Session planning:
  - recording session entities
  - episode-to-session linkage
  - calendar event `session_id` linkage

## Explicitly Excluded

- Hearth does not control recording capture.
- Hearth does not perform media editing.
- Hearth does not publish to platforms.
- Scheduling and session linkage do not mark content recorded.
- Recorded state remains driven by kept-take receipts from Anvil to Tongs.

## Authority Boundaries

- Hearth owns editorial shaping and package generation.
- Tongs/Workspace owns persistence and storage decisions.
- Calendar owns scheduling representation.
- Anvil/Hammer/Quench/Ledger own execution in their domains.

## Episode Package V2 Contract

Canonical storage file:

- `metadata.json` in the episode/workpiece

Canonical structured paths:

- `episode.seo`
- `episode.thumbnail`
- `episode.image_map`

### `episode.seo`

- `titles: [{ id, label, text, is_primary }]`
- `tags: string[]` (normalized + deduped)
- `description_short: string | null`
- `description_long: string | null`

### `episode.thumbnail`

- `concepts: [{ id, label, prompt_text, style_preset? }]`
- `versions: [{ id, concept_id, created_at, provider, prompt, asset_id, status, ... }]`
- `primary_version_id: string | null`

Notes:

- Generated versions register Workspace assets and persist `asset_id`.
- Fallback uploads are also stored as version records and remain selectable as primary.

### `episode.image_map`

- `entries: [{ id, anchor, description, intent, source_type, placement_hint? }]`

Export JSON shape (Hammer-ready):

```json
{
  "schema_version": 2,
  "image_map": {
    "entries": []
  }
}
```

## Runtime/Smoke Coverage

Current smoke validation includes:

- V2 metadata persistence and reload behavior
- Thumbnail generation/upload write paths and readback
- Image map structured export shape
- Recording sessions + calendar `session_id` linkage roundtrip
