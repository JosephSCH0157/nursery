# Workspace Permissions (SSOT)

This document is the canonical role matrix for Podcaster's Forge v1 team access.

## Roles (v1)

- `owner`
- `admin`
- `editor`
- `viewer`

Role order is strict: `owner > admin > editor > viewer`.

## Permission Matrix

### Bar Stock

- `viewer`: read sparks and episodes/workpieces.
- `editor` and above: create and edit sparks/episodes.
- `admin` and above: manage invites and delete content (optional destructive actions).

### Calendar

- `viewer`: read events.
- `editor` and above: create and update events.
- `admin` and above: delete events.

### Hearth

- `viewer`: read scripts and sources.
- `editor` and above: write/commit scripts and sources, mark ready.
- `admin` and above: manage ready-state rules (if enabled by product configuration).

## Enforcement Notes

- Workspace membership and role in `tongs.workspace_members` are authoritative.
- UI visibility is convenience only; Supabase RLS + RPC checks are the source of truth.
- RPCs that mutate membership/invites must call role assertions in DB before write.
