# Hammer Media Backbone

This document defines the canonical media-processing posture for Hammer.

## Purpose

Hammer is the canonical owner of media preparation, export planning, and rendering
derived from editing operations. Hammer may plan, execute, simulate, or delegate
rendering as needed, but render logic and contracts remain under Hammer authority.

Hammer does not assume that every environment has identical media tooling.
Media capabilities must be discovered at runtime and used through explicit,
contract-backed flows.

Ownership is not limited by implementation maturity. Render paths may be
implemented incrementally without transferring ownership to any other tool.

---

## Current Canonical State

- Built-in baseline audio polish remains valid for supported WAV-based paths.
- External FFmpeg/ffprobe installations may be present and may be used when
  runtime capability detection confirms availability.
- Hammer may inspect, prepare, transform, and render media through the media
  contract seam.
- Hammer may define export plans, release-prep packages, render jobs, and
  downstream handoff artifacts even if some execution paths are still incomplete.

Hammer owns rendering logic even where specific render paths are not yet fully
implemented.

---

## Runtime Capability Model

Runtime hooks may include:

- `HAMMER_MEDIA_BACKEND=auto|builtin|ffmpeg`
- `HAMMER_FFMPEG_BIN=/absolute/path/to/ffmpeg`
- `HAMMER_FFPROBE_BIN=/absolute/path/to/ffprobe`

These variables indicate potential capability only. Hammer must confirm
availability before selecting an FFmpeg-backed execution path.

Hammer must not assume FFmpeg is universally available across deployments.

---

## Canonical Rules

- Hammer is orchestration-first but may also execute rendering when capable.
- Media processing flows through an explicit contract seam.
- FFmpeg usage must be explicit and capability-gated.
- Lack of a specific implementation does not prohibit development of that path.
- Rendering ownership remains with Hammer regardless of execution maturity.
- Tongs remains canonical artifact authority for persisted outputs.

---

## Allowed Now

Hammer may perform:

- runtime capability detection
- ffprobe-based media inspection
- source-media fingerprinting and planning
- working-audio extraction from video or non-WAV sources
- normalization into canonical working audio
- waveform and proxy generation where implemented
- subtitle generation and export packaging
- clip extraction and audio mixdown tied to edit decisions
- render job definition and execution where capability allows
- simulated rendering flows for incomplete paths
- release-prep package creation
- downstream handoff to Tongs

---

## Not Yet Canonical as Default Production Behavior

The following may exist but are not required as universal defaults:

- full end-to-end automated release rendering for all workflows
- broad background transcoding outside explicit user actions
- assumptions that FFmpeg-backed processing exists on every deployment target
- silent mutation of source media

These limitations describe maturity, not ownership.

---

## Near-Term Milestone Intent

1. `ensure_working_audio`
   Extract or normalize canonical working audio from supported source media.

2. `generate_waveform_proxy`
   Produce waveform or proxy artifacts for review and editing support.

3. `prepare_release_package`
   Persist transcript, subtitle, media, and provenance readiness as a
   stale-aware handoff package.

4. `render_clip_export`
   Support explicit clip and export rendering flows.

5. `render_final_output`
   Produce final release media artifacts once the full rendering pipeline
   is established.

---

## Tool Boundaries

Hammer
: Owns edit decisions, media preparation, render planning, and rendering
  derived from editing operations.

Tongs
: Owns canonical storage, artifact indexing, provenance records, and
  handoff state after Hammer produces outputs.

Quench
: Owns distribution, scheduling, packaging for platforms, and publication.

No other tool assumes ownership of editor-derived rendering.

---

## Boundary Reminder

This backbone does not restrict media development.

Its purpose is to ensure that:

- rendering authority remains centralized in Hammer
- capabilities are used explicitly and safely
- artifacts remain canonical once produced
- environments without certain tools remain supported
- development can proceed without artificial prohibitions

Hammer may grow into full rendering capability over time without changes
to ownership or architecture.