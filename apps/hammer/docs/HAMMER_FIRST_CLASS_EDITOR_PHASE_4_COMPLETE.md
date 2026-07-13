# Hammer First-Class Editor — Phase 4 Complete

Completed: 2026-07-13.

## Canonical editing path

The minimum podcast workflow emits `HammerCompositionCommand` values only. Frame-indexed constructors cover split, trim, lift, ripple delete, and transcript-driven media deletion. Track visibility, mute, solo, lock, and source roles remain Composition V2 state. Every accepted command enters the Phase 2 transaction/history boundary and requires Tongs acknowledgement before becoming canonical.

Linked audio/video clips share a link-group identity. Split and trim apply coherently to every linked member and refuse if any participating track is locked. Partial lift and ripple operations preserve surviving source ranges rather than deleting whole overlapping clips. Lift leaves a deterministic gap; ripple closes the range across all unlocked tracks. Repeated Undo still restores the untouched raw composition.

Frame/time conversion uses an explicit rational frame rate. Playhead and selection values are integer frames, and snapping chooses deterministic candidate frames within an integer tolerance.

## Transcript and timeline interaction

Transcript-range selection resolves intersecting canonical clips and exact frame boundaries. Timeline-range selection resolves intersecting transcript segments. Speaker navigation and transcript search are read-only navigation/filter operations and emit no creative command.

Text operations remain separate:

- Transcript correction records corrected words and marks dependent captions stale; media is unchanged.
- Caption correction changes only the selected caption clip payload; transcript truth is unchanged.
- Search performs navigation/filtering only.
- Replace is represented only by an explicit transcript-correction or caption-correction command.
- Removing recorded speech emits `delete_transcript_range`, which is a media-range editorial deletion compiled through the same timeline reducer.

## Preview and render

All edit results compile through Render Plan V1. Golden tests prove lift gaps preserve program duration, ripple deletion closes linked tracks by the exact frame range, and the shared plan duration advances accordingly. Preview cannot apply a timing shortcut outside that plan.

## Persistence, migration, and RLS disposition

Phase 4 adds no persistence path, migration, or RLS policy. Commands, history, acknowledgement, conflict behavior, and reload all use the Phase 2 Composition V2 transaction on `tongs.recording_revisions`.

## Permanent proof

Regression coverage includes linked split/trim, partial source preservation, lift gaps, ripple closure, source roles, mute/solo/visibility compilation, track-lock refusal, deterministic snapping, frame-accurate playhead/selection, bidirectional transcript/timeline selection, speaker navigation, transcript correction, caption isolation, explicit media deletion, shared-plan timing, persistence acknowledgement, undo/redo, and raw-state Undo.

## Explicit deferrals

Source/program monitors and roll/slip/slide remain deferred. They may not create a second playhead, timeline authority, or command/history path.
