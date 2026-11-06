# Henry v1 Manifest

Henry is the Forge orientation layer. It explains context, keeps workflow optional, and remains non-blocking.

## Product role
- Persistent launcher across Forge surfaces
- Deterministic context summary and next-step guidance
- Rare non-modal observations with suppression/cooldown
- Optional, user-invoked chat inside panel only

## Funding and cost policy

Henry is Forge-funded and cost-tracked, with service cost limited to 10% of
the user's balance. The canonical policy, accounting boundaries, and remaining
cap-definition details are in
[Forge Financial Architecture §3.1](docs/billing/FORGE_FINANCIAL_ARCHITECTURE.md#31-anvil-and-henry-forge-funded-cost-tracked-assistance).

Provider-backed Henry assistance must respect that limit through Tongs.
Deterministic orientation remains available without a provider call. This
policy statement does not establish that runtime enforcement is implemented
or certified.

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
