# HearthShell Phase 2 Reset Matrix

Status: locked before extraction
Authority: `FORGE_SPARK_TO_ANVIL_LIFECYCLE_CANON.md`
Scope: identity and navigation only

Identity is a routing signal. It tells collection, editorial, and production
owners what scope to load. It does not load, reconstruct, clear, or persist
their canonical state.

| State | Owner | Workspace changes | Workpiece changes | Draft revision changes | Approved script changes |
| --- | --- | --- | --- | --- | --- |
| Workspace identity | Identity | Resolve new identity | Survive | Survive | Survive |
| Workpiece identity | Identity | Clear | Resolve new identity | Survive | Survive |
| Layout and density preference | Navigation | Reload workspace preference | Survive | Survive | Survive |
| Mode and focus tab | Navigation | Reset to Episodes | Restore guarded workpiece mode | Survive | Survive |
| Workpiece workspace tab | Navigation | Clear/restore | Restore scoped preference | Survive | Survive |
| Mobile overlay | Navigation | Close | Re-resolve from mode/draft | Survive | Survive |
| Sparks, Episodes, Ready, Series | Collection | Reload | Survive | Survive | Survive |
| Draft, revisions, planning, chat, attachments, presence | Editorial | Clear | Reload | Reload applicable revision state | Survive |
| Canonical approval | Editorial | Clear | Reload | Revalidate | Reload |
| Episode package and visual selections | Production | Clear | Reload | Survive | Revalidate |
| Canonical production artifacts | Production | Clear | Reload | Survive | Revalidate/invalidate per existing contracts |

## Timing and ownership rules

- Workspace reset signals fire only after the workspace identity changes.
- Workpiece identity changes invalidate stale operation tokens immediately
  through the existing operation-authority epoch.
- Domain clearing stays with the existing collection, editorial, and
  production lifecycle hooks.
- Navigation may persist only existing UI preferences. It cannot write
  workpieces, drafts, approvals, revisions, or production artifacts.
- Draft revision and approved-script transitions do not mutate route
  identity.
- No Phase 2 module imports a repository, Tongs client, canonical loader, or
  persistence service.
