# Hammer First-Class Editor Phase 7 Completion

Phase 7 establishes captions, graphics, and bounded templates as canonical creative state inside Hammer Composition V2.

## Authority impact

Caption authority is split deliberately:

- The editorial transcript remains the authority for recorded speech truth.
- `HammerCaptionArtifactV1` is the separately editable caption artifact for burn-in and sidecar output.
- Caption cue edits update caption artifact text only; they do not rewrite transcript corrections or claim recorded speech changed.
- Transcript corrections mark dependent captions stale unless the creator explicitly rebuilds or preserves the caption artifact.

Graphic authority is also canonical:

- Lower thirds, chapter cards, quote cards, statistic cards, and brand packages are represented as Composition V2 graphic clips with `HammerGraphicTemplateV1`.
- Template versions, style presets, safe areas, and bounded keyframes are validated before render-plan compilation.
- General compositing and broad motion design are deferred; Phase 7 templates are bounded podcast graphics.

All Phase 7 creative changes use Composition V2 commands and canonical history transactions.

## Permanent regression proof

The Phase 7 foundation gate proves:

- caption artifacts build from canonical transcript segments;
- caption cue edits do not mutate transcript truth;
- transcript changes invalidate captions;
- rebuild and explicit preserve decisions are modeled;
- reading speed, line limits, safe areas, and template versions are enforced;
- lower thirds, chapter cards, quote cards, statistic cards, and brand packages compile through canonical graphics;
- bounded keyframes reject out-of-range values;
- repeated Undo restores the untouched pre-Phase-7 composition.

## Preview/render implications

`HammerRenderPlanV1` now validates caption artifacts and graphic templates.

Caption artifact cues compile into caption render operations. Graphic template payloads compile as graphic operations. Interactive preview consumes the same operations as render, so caption timing, safe areas, template versions, and graphic keyframes cannot be invented by preview UI state.

Stale caption artifacts fail closed before preview/render compilation.

## Migration and RLS disposition

No new migration or RLS policy is required for Phase 7.

Phase 0 and the Composition V2 baseline already established the revision-scoped Composition V2 artifact as the persisted creative authority, guarded by Tongs compare-and-swap acknowledgement and existing recording-revision RLS. Phase 7 stores caption artifact and template authority inside that canonical document rather than adding a separate durable template table.

A future reusable, workspace-wide template library would require its own Tongs-owned schema and RLS review. That is explicitly outside this phase.

## Explicit deferrals

Deferred refinements:

- general compositing;
- broad motion-design authoring;
- advanced easing editors;
- reusable franchise-level template libraries.

These deferrals do not block the first complete podcast-editing path.
