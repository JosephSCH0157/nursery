# Hammer First-Class Editor — Phase 3 Complete

Completed: 2026-07-13.

## Deterministic compiler authority

`compileHammerRenderPlan` accepts runtime-validated `HammerCompositionV2` only. It deterministically resolves enabled and soloed track state, timeline and source ranges, camera/source choices, track roles and layer order, transforms and other clip payloads, captions, graphics, transitions, automated placements, ordered audio treatments, and intro/program/outro packaging.

Every media operation carries the canonical Phase 1 source fingerprint. Every plan carries its Composition V2 revision/fingerprint, complete source-fingerprint set, compiler version, resolved packaging references, stable operation ordering, duration, and a fingerprint over the full derived plan.

Invalid source/timeline ranges, unavailable or unresolved media, stale captions, and unresolved package boundaries block compilation. Plans are derived values and cannot modify creative state.

## Interactive preview boundary

`buildHammerInteractivePreviewFrameV1` is the semantic preview runtime. It accepts a signed Render Plan V1, current composition fingerprint, current provenance, optional disposable proxies, and playhead time. It verifies the plan fingerprint, rejects stale composition and source sets, selects active operations in canonical layer order, and emits visual, audio, caption, transition, audio-treatment, and placement layers plus resolved preview providers.

Preview providers may substitute a fingerprint-matched proxy or reduced-quality implementation. They cannot create timing, visibility, order, transforms, transitions, captions, placements, or audio intent because those values exist only in plan operations. Final render consumes the same operations and canonical fingerprints.

Pixel-level equivalence is not claimed. Semantic parity is mandatory and proven at the plan/frame boundary.

## Golden proof

The frozen semantic fixture contains continuous intro/program/outro media, two camera choices, a music bed, captions, lower-third graphics, transforms, three transitions, two audio treatments, packaging references, and automated placement. Tests lock both the complete plan fingerprint and a representative preview-frame fingerprint, operation details, ordering, and active layer selection.

Additional regression proof covers deterministic recompilation after serialization, non-V2 rejection, invalid/missing sources, preview proxy versus canonical-render fingerprint identity, stale plan rejection, stale source-set rejection, and plan tamper rejection.

## Persistence, migration, and RLS disposition

Render plans and preview frames are deterministic derived artifacts. Phase 0 found no correctness need to persist them, and Phase 3 adds no schema, migration, or RLS policy. If cached, they remain disposable and must be regenerated from the acknowledged Composition V2 transaction.

## Explicit deferrals

Pixel-perfect final effects, hardware-specific provider fidelity, render-farm execution, and distributed render reliability remain deferred. They must consume Render Plan V1 and may not introduce another creative representation.
