# Tongs Path Charter v1

Last updated: 2026-03-18

This document defines the canonical file layout for Forge workpieces and workspaces.
Authorization is enforced by Supabase RLS and membership, never by storage key prefix.

**Canonical Identities**
- `user_id` = canonical workspace owner / `tongs.workspaces.created_by`
- `workspace_id` = `tongs.workspaces.id`
- `workpiece_id` = `tongs.episodes.id`
- `path` = relative path stored in `tongs.workpiece_files.path`

**Storage Key Layout**
- Workpiece files: `workpieces/{workpiece_id}/{path}`
- Canonical cloud role roots: `{user_id}/{workspace_id}/{role}/{path}`
- `role` is one of: `scripts`, `barstock`, `assets`, `projects`, `recordings`, `exports`
- Non-role workspace support files may still exist under `workspaces/{workspace_id}/{path}` during compatibility window.

**Compatibility Rule (Temporary)**
- Tongs writes canonical role-root objects to `{user_id}/{workspace_id}/{role}/...`.
- Tongs listing and reads check canonical role-root prefixes first.
- Legacy role-root prefixes under `workspaces/{workspace_id}/{role}/...` are fallback-only for existing objects that have not been migrated yet.
- Legacy prefixes are not authoritative and must not be used for new canonical role-root writes.

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

**Canonical Cloud Role Tree**
- `{user_id}/{workspace_id}/scripts/...`
- `{user_id}/{workspace_id}/barstock/...`
- `{user_id}/{workspace_id}/assets/...`
- `{user_id}/{workspace_id}/projects/...`
- `{user_id}/{workspace_id}/recordings/...`
- `{user_id}/{workspace_id}/exports/...`

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
