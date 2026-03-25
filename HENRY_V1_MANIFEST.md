# Henry v1 Manifest

Henry is the Forge orientation layer. It explains context, keeps workflow optional, and remains non-blocking.

## Product role
- Persistent launcher across Forge surfaces
- Deterministic context summary and next-step guidance
- Rare non-modal observations with suppression/cooldown
- Optional, user-invoked chat inside panel only

## Non-goals
- No autonomous task execution
- No workflow gating
- No auto-open or intrusive overlays
- No replacement for canonical workflow state

## Canonical dependencies
- Episode context: `apps/nursery/src/workspace/EpisodeWorkspaceContext.tsx`
- Phase/status model: `apps/nursery/src/workspace/episodePhases.ts`, `resolveNextEpisodeAction.ts`
- Persistence SSOT: Supabase `tongs` schema

## Implementation anchors
- Provider: `apps/nursery/src/henry/HenryProvider.tsx`
- UI: `apps/nursery/src/henry/HenryUI.tsx`
- Engine: `apps/nursery/src/henry/henryMessageEngine.ts`
- Persistence: `apps/nursery/src/henry/henryService.ts`
