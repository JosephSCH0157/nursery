# Henry v1 Manifest

Henry is the Forge orientation layer. It explains context, keeps workflow optional, and remains non-blocking.

## Product role
- Persistent launcher across Forge surfaces
- Deterministic context summary and next-step guidance
- Rare non-modal observations with suppression/cooldown
- Optional, user-invoked chat inside panel only

## Funding and cost policy

Henry AI operations are Forge-funded platform services. Forge pays and tracks
their provider expenses separately from customer prepaid credits and BYOK
execution. Included operations do not deduct prepaid credits, use customer
balances as a limit basis, or require BYOK credentials.

[Forge Financial Architecture §3.1](docs/billing/FORGE_FINANCIAL_ARCHITECTURE.md#31-anvil-and-henry-forge-funded-cost-tracked-assistance)
owns the operating policy, evidence requirements, and unresolved allowance
decisions. Monthly allowances based on subscription tier and actual wholesale
costs are preferred for evaluation; no tier, amount, eligibility, or reset period
is approved here. Henry and Anvil costs must be separately measurable; whether
they share an allowance remains undecided.

Per-account limits and aggregate platform exposure controls are required.
Intended enforcement must stop additional billable AI work when the applicable
allowance is exhausted while preserving deterministic orientation and other
non-AI functionality. Forge funding is bounded and accountable.

This states approved funding policy and intended future controls, not verified
implementation or deployed allowance enforcement. The investigation's financial
defects and certification gaps remain unresolved until separately evidenced.

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
