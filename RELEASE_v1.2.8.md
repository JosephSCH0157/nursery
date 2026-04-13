## Podcaster’s Forge v1.2.8

Date: 2026-04-13  
Tag: `v1.2.8`

### Highlights
- Hammer: canonical recording + revision workflow groundwork (DB-first), plus expanded diagnostics and editor stability improvements.
- Hammer: audio polish pipeline hardening (better input resolution, richer loudness parsing, Forge FFmpeg fallback behavior).
- Hearth: mobile intake fixes (spark → opens the correct editable episode context) and B-roll uploaded video candidates now guide thumbnail ingestion instead of attempting to preview raw `.mp4` as an image.
- Nursery: research/source ingest contract improvements (including YouTube description extraction) and script/tooling type hygiene.

### Hearth — Mobile intake + B-roll thumbnails
- Spark intake on mobile now surfaces the intake bootstrap view instead of silently landing on the Episodes list.
- B-roll candidate cards no longer attempt to render raw video uploads as `<img>` previews; video candidates show an explicit “Generate Thumbnail” action when a preview poster hasn’t been ingested yet.

### Hammer — Canonical recordings + revisions (Phase 1)
- Introduces canonical recording + revision scaffolding so mutable editor state can live in revision-scoped records while canonical baselines become sealable/immutable.

### Supabase / Migrations
This release includes new migrations (apply in order during deploy):
- `supabase/migrations/20260408123000_tongs_canonical_recordings_and_revisions_phase1.sql`

