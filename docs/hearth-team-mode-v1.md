# Hearth Team Mode v1

Hearth Team Mode rules are non-optional for shared workspace behavior.

## Rules

1. Hearth content is always scoped to the active workspace.
2. All projects, drafts, and ready scripts shown in Hearth are workspace-visible only.
3. Attribution is visible on:
   - project/draft list rows
   - ready-to-record rows
   - script header
4. Collision strategy is soft presence + last-write-wins with explicit conflict warnings.
   - no hard locks in v1
   - show active teammate presence
   - warn on stale-save conflict and provide reload/copy options

## Implementation Notes

- Presence is persisted in `tongs.hearth_workpiece_presence` with TTL semantics (`last_seen_at` active within ~60s).
- Workspace switching must clear workspace-specific local selections and rehydrate from Tongs.
- Draft attribution is persisted in Hearth draft snapshot documents (`hearth/drafts.v1.json`) and mirrored in UI.
