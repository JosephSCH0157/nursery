# Hearth Current Product Manifest

Release baseline: Forge v1.2.0 Fire Burning (`forge-v1.2.0`).

Hearth owns editorial intent and pre-production creative decisions: **what should be made**, not how downstream tools execute it. It helps creators develop ideas through producer/editorial questions, research and framing, script drafting and revision, and titles, tags, descriptions, and other public metadata. Hearth curates Ready candidates; creator approval is explicit and distinct from Ready.

Hearth also creates and curates workpiece-scoped thumbnail concepts and assets, still images, B-roll prompts and assets, Reference Clips, Reference Visuals, and unified Visual Plan intent. AI assistance is optional. Paid generation requires an explicit creator-controlled action and the applicable authorization and spending confirmation; opening Hearth never authorizes a charge. Tongs must acknowledge persisted results before Hearth presents them as saved.

This manifest describes current product scope, not executable authority. The [Forge lifecycle canon](../../FORGE_SPARK_TO_ANVIL_LIFECYCLE_CANON.md) takes precedence, followed by [Hearth canonical authority](HEARTH_CANONICAL_AUTHORITY.md), [agent rules](AGENTS.md) and current tool contracts, then the scoped [V2](HEARTH_V2_CONTRACT.md), [navigation](HEARTH_NAVIGATION_CONTRACT.md), and [research](HEARTH_RESEARCH_CONTRACT.md) contracts. Those contracts own detailed state and payload shapes.

## Current visual workflow

Hearth currently supports a unified Visual Plan containing Images, B-roll, Reference Clips, and Reference Visuals. Each script passage belongs to one visual family.

- Images are generated or curated still treatments.
- B-roll describes motion, process, atmosphere, or newly created coverage.
- Reference Clips are first-class excerpts of authentic source media and never degrade into generic B-roll.
- Reference Visuals are source-backed treatments of facts, data, quotations, documents, comparisons, or timelines. They retain evidence and rights chains separate from Reference Clips.

Reference Clips and Reference Visuals share a creator-facing Reference Material review queue but never share canonical identity. The queue is a disposable projection over Tongs readback.

The unified queue is controlled by the canonical, default-off workspace flag `reference_material_review_enabled`. Hearth reads that authority from Tongs and retains the established reference workflow whenever the flag is disabled or unavailable.

Creators decide `Approve`, `Edit`, `Replace`, or `Skip`. Internal acquisition, evidence extraction, rendering, immutable revisions, persistence verification, and Hammer handoff are not creator workflow stages. A proposal is Ready only when its durable decision exactly matches Hammer: approved identities are present; skipped opportunities are absent.

Pasted URLs are drafts until `Use this source`. That explicit action may authorize disclosed AI-assisted analysis under the creator's credit preference. Deterministic retrieval remains available without AI authorization. Missing publication metadata remains unknown, and uncertain licensing blocks reproduction rather than facts-only use.

## Authority boundaries

- Hearth owns editorial proposals, creator interaction, and pre-production asset creation and curation; people choose what to approve or generate.
- Tongs owns canonical identity, persistence, durable readback, Sources, evidence, rights declarations, revisions, media identities, selections, dispositions, and receipts.
- Calendar owns scheduling; Hearth Ready is not a scheduled recording or approval.
- Anvil owns recording and capture.
- Hammer owns editing, timing, executable placement, and final-media truth; Hearth's placement hints are advisory.
- Quench owns publishing; Hearth does not declare publish readiness.
- Ledger owns analytics.
- Signed URLs and previews are ephemeral presentation fields, never identity or persistence.

The [historical V1 manifest](HEARTH_V1_MANIFEST.md) records the original script-only scope; later visual capabilities are current product scope, not retroactive V1 features.
