# Hammer

Podcast-First Video Editor for Podcaster's Forge

## Overview

Hammer is the editing workstation in the Forge pipeline.

It transforms recorded sessions into polished episodes and short clips using a transcript-first workflow optimized for podcasts, interviews, and commentary formats.

Hammer prioritizes:

- dialogue editing
- non-destructive workflows
- fast cleanup of spoken content
- integration with other Forge tools

## Forge Pipeline Context

Bar Stock -> Hearth -> Tongs -> Anvil -> Hammer -> Quench -> Ledger

- Hearth generates scripts, assets, and short candidates.
- Anvil records sessions.
- Tongs stores canonical metadata and edit layers.
- Hammer performs editing.
- Quench handles publishing and scheduling.
- Ledger tracks performance analytics.

## Design Philosophy

Hammer blends proven concepts from:

- Descript: transcript-based editing
- ElevateIO: creator workflow acceleration
- Windows Movie Maker: simplicity and low-friction UX

Hammer intentionally does not aim to be a cinematic multi-track editor.

## Key Features

- Transcript-driven editing
- Non-destructive timeline edits
- AutoRipple timeline behavior
- Filler and retake removal
- Jump-cut smoothing
- Studio-sound audio processing controls
- Hearth-generated asset placement workflows
- Active-speaker reframing for shorts
- Reusable intro/outro templates
- Macro-based workflow automation

## Storage Model (V1)

- Tongs = canonical metadata and instruction layers
- Workspace mapped folder = media bytes (recordings/exports)

Hammer reads canonical metadata from Tongs and resolves media bytes from workspace-level mapped folders until Forge cloud media storage is enabled.

## V1 Constraints

Hammer v1 intentionally operates with the following constraints:

- Media bytes remain local via workspace mapped folders
- Tongs remains the canonical metadata and edit instruction store
- Only one editor may hold a project edit lock at a time
- AI tools provide suggestions but never rewrite spoken dialogue

## Timeline Model

- V2 Overlays (B-roll / images)
- V1 Main Video
- A2 Secondary Audio
- A1 Dialogue

V2 overlays render visually above V1 without interrupting dialogue unless explicitly configured.

## Non-Destructive Guarantee

Hammer never alters source recordings.

Edits are stored as instruction layers in Tongs. Users can undo, reset edits, and retune timelines without mutating originals.

## What Hammer Is Not

- Not a cinematic VFX editor
- Not a deep color-grading suite
- Not an AI voice-rewrite tool

## Status

- Status: V1 in development
- Canonical manifest: [`../../docs/HAMMER_MANIFEST.md`](../../docs/HAMMER_MANIFEST.md)
- Interaction architecture: [`../../docs/HAMMER_EDITOR_ARCHITECTURE.md`](../../docs/HAMMER_EDITOR_ARCHITECTURE.md)
- Architecture context: [`../../docs/FORGE_SYSTEM_ARCHITECTURE.md`](../../docs/FORGE_SYSTEM_ARCHITECTURE.md)

## Local Development

Hammer app scaffolding is in progress, but the runtime boundary is now explicit.

Canonical runtime ownership:

- Production editor route: `/app/hammer/editor`
- Production runtime entry: `apps/hammer/src/app/HammerEditorRuntime.tsx`
- Production editor composition: `apps/hammer/src/editor/HammerWorkspaceEditor.tsx`
- Dev editor harness: `/app/hammer/dev/editor`
- Legacy prototype surface: `apps/hammer/src/dev/TranscriptSeekMock.tsx`

Until a standalone Hammer runtime is added, Forge route wiring still lives in `apps/nursery`, but the live editor now mounts through the production runtime entry instead of importing the legacy prototype surface directly.

Canonical persistence ownership:

- Hammer summary state lives in `tongs.hammer_workpiece_state`.
- Hammer presence/lock heartbeat lives in `tongs.hammer_workpiece_presence`.
- Hammer artifact bodies live in canonical `tongs.workpiece_files` paths such as `hammer/session/editor-state.v1.json` and `hammer/edit-plan/current.v1.json`.
- Production Hammer reads and writes through the Hammer persistence seam in `apps/hammer/src/persistence/hammerPersistence.ts`; dev JSON import/export in the prototype surface remains secondary only.

## Week 1 Media Reality Check

This runtime slice is real-media first. Hammer prep is expected to process real local/canonical media and persist canonical artifacts in Tongs.

- FFmpeg/ffprobe detection:
  - preferred explicit env: `HAMMER_FFMPEG_BIN`, `HAMMER_FFPROBE_BIN`
  - fallback probe on PATH: `ffmpeg`, `ffprobe`
- Working-audio behavior:
  - non-WAV and video sources normalize to deterministic working WAV artifacts
  - output format: `pcm_s16le` at `48kHz`
  - mono/stereo channel layout is preserved
- Canonical truth fields are written into `audio_polish.settings_summary`, including:
  - source and working duration
  - sample rate, channels, bit depth
  - timebase
  - source extension and working-audio artifact path

Run this slice through Nursery:

```bash
pnpm --filter nursery dev
```

Expected prep outcomes:

- `prepared`: audio polish artifact committed, preview can use real prepared media
- `failed` with `source_unavailable`: media pointer/path not resolvable
- `failed` with `processing_failed`: media processed path errored during extraction/polish
- `failed` with `unsupported_source`: source format/layout cannot run through current baseline path

Week 1 closeout:

- shipped: real ingest, deterministic working WAV for non-WAV/video sources, canonical media truth metadata, real playback against prepared media
- verified: `.wav`, `.mp3`, `.m4a`, `.mp4`, `.mov` route through prep successfully in the automated format matrix
- deferred: waveform proxy generation and broader playback-polish UX

## Hammer — Week 1: Real Media Backbone (Signed Off)

Hammer now ingests and prepares real media end-to-end without synthetic fallback.

### Shipped

- FFmpeg/ffprobe runtime detection with env override and PATH fallback
- Deterministic working-audio extraction to canonical WAV (`48 kHz`, `pcm_s16le`)
- Canonical media truth metadata persisted per prep
- Production playback path uses real prepared media
- Operator runbook documented

### Verified

- Automated prep matrix across `.wav`, `.mp3`, `.m4a`, `.mp4`, `.mov`
- Truth metadata assertions validated
- Core Hammer prep/backend tests passing
- Long-file prep smoke (`10-minute` source) successful

### Known Limitations

- Waveform proxy generation deferred
- Extended in-browser editing soak not yet completed
- Some media truth fields not yet surfaced prominently in UI
- Preview uses native playback; render prefers FFmpeg

### Signoff

Week 1 vertical slice complete: Hammer processes real media without cheating.

## Future Work (V2+)

- Cloud media storage
- Collaborative editing
- GPU-accelerated preview rendering
- Deeper Quench automation
