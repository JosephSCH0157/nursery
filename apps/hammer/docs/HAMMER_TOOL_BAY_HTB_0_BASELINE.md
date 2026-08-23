# HTB-0 — Hammer Tool Bay architecture baseline

Status: contract freeze. This record characterizes `HammerWorkspaceShellToolBay.tsx` before extraction. It does not authorize behavior, persistence, identity, history, reducer, or selection changes.

## Frozen authority boundary

The Tool Bay is presentation and presentation-only event binding. Canonical timeline, asset, transcript, caption, audio, packaging, release, history, and persistence authorities remain outside it. Tool mounting, manual Tool Bay switching, and selection-driven surface reveal must issue **zero persistence requests**. Hydration and passive restoration must not navigate or mutate selection.

Current measured baseline:

| Measure | Ceiling |
| --- | ---: |
| Physical lines | 4,020 |
| TypeScript `any` nodes | 339 |
| `ctx.` property references | 299 |
| Textual `as any` assertions | 229 |

`architecture-baseline.json` and `scripts/check-architecture-ratchet.mjs` enforce all four as non-growth ratchets. Reductions become the next accepted ceiling; increases require extraction or a typed panel contract, not a baseline raise.

## Top-level routing inventory

Routing is presently JSX-local and ordered. The inventory deliberately records fallbacks that later HTB phases must replace, without changing them in HTB-0.

| Predicate | Mounted surface | Current fallback / contradiction behavior |
| --- | --- | --- |
| `activeTool === "polish"` and pass is `transcript_cleanup`, `retakes`, or `gap_pacing` | Focused cleanup review: filler candidates, retakes, or silence gaps | Other passes mount the general Transcript Polish panel |
| `activeTool === "polish"` otherwise | Transcript Polish and cleanup preview/receipt | One broad panel infers available cleanup controls from pass/state |
| `activeTool === "audio"` and `currentPass === "audio_finalization"` | Audio Finalization / Voice Polish | None inside the branch |
| `activeTool === "audio"` otherwise | Audio Adjustments, podcast master, Studio Rack, leveling/noise controls | Pass mismatch silently selects the general audio surface |
| `activeTool === "video"` | Visual tool selector | Selector does not itself change canonical state or persist |
| `activeTool === "video"` and `activeVisualTool === "polish"` | Visual Polish and diagnostics | None inside the branch |
| `activeTool === "video"` and `activeVisualTool === "images"` | Image Placement and transform controls | Selection absence is rendered as hints/disabled controls |
| `activeTool === "video"` and `activeVisualTool === "broll"` | B-roll/reference binding inspector and transition controls | None inside the branch |
| `activeTool === "video"` with any other visual subtool | Unsupported Video Mode | Explicit visible unsupported state already exists here |
| `activeTool === "captions"` | Caption Output | State/freshness controls decide enabled commands inside the panel |
| `activeTool === "details"` | Edit Metadata | No pass-specific routing |
| `activeTool === "finishing"` and `currentPass === "packaging"` | Packaging | Otherwise falls through to Finishing Checklist |
| `activeTool === "finishing"` otherwise | Finishing Checklist | Pass mismatch silently selects checklist |
| `activeTool === "export"` and `currentPass === "ready"` | Ready State and send-to-Quench action | None inside the branch |
| `activeTool === "export"` otherwise | Quench Handoff / release readiness | Pass mismatch silently selects handoff |
| Unknown `activeTool` | Header only; no panel | No explicit unsupported root state |

The current shell supplies `activeTool`; the current visual subtool contract supplies `activeVisualTool` and `onSelectVisualTool`. HTB-2 owns any change to reveal-versus-restore routing. HTB-0 freezes these predicates.

## Surface and command regression matrix

| Surface | Selection / state dependency | Important callbacks and commands currently bound | Persistence on mount/switch |
| --- | --- | --- | --- |
| Transcript cleanup | Current pass, transcript/segment candidate and selection state | refresh candidates, preview/seek, accept/dismiss candidate, set cleanup options, preview/apply/discard cleanup, timing hint/focus | Zero |
| Visual polish and diagnostics | Visual polish state; selected clip for some preview diagnostics | look/exposure, color/white balance, background blur/replace/wash, segmentation provider/debug controls, eye-contact assist | Zero |
| Image placement | `selectedImagePlacement`, selected clip/asset, anchor segment | preview/reset auto-position, commit placement window, retime, remove by placement id, relabel/refine anchor | Zero |
| Image transform | `selectedImagePlacement` plus derived transform | update/commit X, Y, scale, and reset transform using the selected placement id | Zero |
| B-roll/reference | selected bound operation, attention queue, resolved/unresolved suggestion state | add transition, navigate/focus attention, move/trim binding, replace, revert, resolve/discard, identity-bound removal control | Zero |
| Audio | Audio polish/finalization, master layer, Studio Rack state | voice cleanup/fixes/presets, compare, podcast master, Studio Rack enable/bypass/backend/module mutation, leveling/noise | Zero |
| Captions | Caption artifact mode, freshness, edited/built state | build/rebuild, enable/discard edits, formatting, artifact format, edit/split/merge/punctuation/speaker-label operations | Zero |
| Metadata | Detail tag state | set detail tag | Zero |
| Packaging | Intro/outro Source Desk selection and resolved paths; packaging placements; logo state | apply/remove intro/outro by packaging identity, select/toggle/style logo | Zero |
| Finishing | Checklist state | set transcript/visual/audio review flags | Zero |
| Ready/export | Readiness verdict, prepared package, truth postures, handoff state | focus next issue, send to Quench | Zero |

Commands may persist only when the user explicitly invokes an established mutation command and that command crosses the existing history/persistence boundary. Merely rendering a row above, changing Tool Bay tabs, selecting a compatible surface, hydration, or passive restoration must not do so.

## Callback and branch ownership inventory

The 299-reference ratchet is the machine-enforced complete inventory of reads from the generic context bag. The principal callback groups are:

- shell focus and completion: `setFocusOverride`, `onMarkComplete`;
- transcript cleanup: candidate refresh/accept/dismiss, cleanup option setters, preview/apply/discard, seek and timing feedback;
- visual mutation: placement window, timing, removal, anchor refinement, image transform, look/exposure/background/eye-contact setters;
- B-roll/reference mutation: resolve, discard, move, trim, replace, revert, attention navigation/focus, transition creation;
- audio mutation: voice-polish controls, podcast master, Studio Rack controls, leveling and noise reduction;
- caption mutation: build/rebuild, artifact mode/format, formatting and edited-caption operations;
- packaging mutation: intro/outro apply/remove and logo overlay controls;
- release actions: readiness focus and Quench handoff.

These callbacks remain owned by their existing hooks, reducers, history authority, mutation gateway, and persistence coordinator. Extraction may move bindings but must not reimplement callback semantics.

## Frozen classifications and known legacy seams

- `selectedImagePlacement` currently serves broader visual-placement consumers. It remains available but must gain no new consumers before HTB-6 naming repair.
- Image versus B-roll/reference classification and all existing selection identity semantics are frozen.
- Missing or contradictory root routing is not uniformly visible today: unknown visual subtools are explicit, while several pass mismatches fall through and an unknown root tool mounts no panel. HTB-2 must characterize and then replace those paths centrally.
- The history label `Remove image placement` is compatibility-sensitive and is frozen pending explicit evidence review in HTB-6.
- No DB migration, RLS change, persistence format change, or production authentication is part of HTB-0.

## HTB-0 acceptance gate

Run:

```text
pnpm --dir apps/hammer architecture:ratchet
pnpm --dir apps/hammer typecheck
pnpm --dir apps/hammer lint
git diff --check
```

The architecture command is the enforcement point for Tool Bay line count, `ctx.` references, and both AST-level and textual `any` debt. Subsequent HTB commits must lower or preserve these ceilings and add focused behavior coverage for each extracted mounted panel.
