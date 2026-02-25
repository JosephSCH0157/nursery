# Tongs Path Charter v1

Last updated: 2026-02-24

This document defines the canonical file layout for Forge workpieces and workspaces.
Authorization is enforced by Supabase RLS and membership, never by storage key prefix.

**Canonical Identities**
- `workspace_id` = `tongs.workspaces.id`
- `workpiece_id` = `tongs.episodes.id`
- `path` = relative path stored in `tongs.workpiece_files.path`

**Storage Key Layout**
- Workpiece files: `workpieces/{workpiece_id}/{path}`
- Workspace-scoped files: `workspaces/{workspace_id}/{path}`

**Access Rule (Authoritative)**
- Membership-only via `tongs.workspace_members` and RLS.
- Storage key prefixes must never be treated as an access gate.

**Workpiece Invariants**
- Every workpiece must contain `manifest.json` at the exact path.
- All file paths are relative (no leading `/`, no `..`).

**Episode Model**
- One workpiece = one episode.
- The episode identifier can equal `workpiece_id` or be stored in `episode.json`.

**Canonical File Tree (Inside a Workpiece)**
Required:
- `manifest.json`
- `episode.json`

Scripts:
- `scripts/script.anvil.txt` (Anvil input, strict tags)
- `scripts/script.source.md` (optional working draft)

Metadata:
- `metadata/titles.json` (A/B/C variants)
- `metadata/description.md`
- `metadata/tags.json` (editorial tags)

Assets:
- `assets/thumbnails/{thumb_id}.png`
- `assets/broll/{asset_id}.json` (prompts or shot list)
- `assets/images/{asset_id}.png|jpg|webp`

Notes:
- `notes/{note_id}.md` (optional)

**Workspace-Scoped Files**
These are indexes or shared catalogs, never the only copy of workpiece-specific data.
- `indexes/sources.json`
- `indexes/episodes.json` (optional cache/index)
- `profiles/{profile_id}/...` (if needed)
- `settings/workspace.json` (if needed)

**Ownership by Tool**
Hearth writes:
- `scripts/*`
- `metadata/*`
- `assets/*` (when enabled)
- `episode.json`

Anvil reads:
- `scripts/script.anvil.txt`

Anvil writes:
- events (preferred), or files under `receipts/` if needed

Hammer reads:
- `assets/*`
- `scripts/*`

Hammer writes:
- edit decisions later (future scope)

Quench reads:
- `metadata/*`
- `assets/thumbnails/*`

Quench writes:
- publish receipts as events

Tongs writes:
- `manifest.json`
- `tongs.workpiece_files` rows
- `tongs.workpiece_events` rows

**Receipts**
- Prefer append-only events for state and audit.
- Example events: `take_completed`, `take_kept`, `take_discarded`, `published`.
