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

Hammer app scaffolding is in progress.

Until a standalone Hammer runtime is added, Forge route wiring exists in `apps/nursery` at `/app/hammer` as a placeholder mount.

## Future Work (V2+)

- Cloud media storage
- Collaborative editing
- GPU-accelerated preview rendering
- Deeper Quench automation
